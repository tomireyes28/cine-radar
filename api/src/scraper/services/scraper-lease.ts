import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type WriteFence = (tx: Prisma.TransactionClient) => Promise<void>;

export async function fencedTransaction<T>(
  db: PrismaService,
  fence: WriteFence | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options = { maxWait: 5000, timeout: 15000 },
): Promise<T> {
  return db.$transaction(async (tx) => {
    await fence?.(tx);
    const result = await work(tx);
    await fence?.(tx);
    return result;
  }, options);
}

/** Local deadline + database lease. The database fence is the authority to write. */
export class ScraperLease {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly deadline: number;
  private readonly timeout: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setTimeout>;
  private renewal?: Promise<void>;
  private closed = false;
  private readonly parentAbort?: () => void;

  constructor(
    private readonly owned: WriteFence,
    private readonly renew: () => Promise<boolean>,
    private readonly heartbeatMs: number,
    maxDurationMs: number,
    private readonly parent?: ScraperLease,
  ) {
    this.deadline = Date.now() + maxDurationMs;
    this.timeout = setTimeout(
      () => this.abort('Scraping execution deadline exceeded'),
      maxDurationMs,
    );
    if (parent) {
      this.parentAbort = () => this.abort('Parent scraping lease ended');
      parent.signal.addEventListener('abort', this.parentAbort, { once: true });
      if (parent.signal.aborted) this.parentAbort();
    }
    this.scheduleHeartbeat();
  }
  private abort(message: string): void {
    if (!this.signal.aborted)
      this.controller.abort(new ConflictException(message));
    if (this.heartbeat) clearTimeout(this.heartbeat);
  }
  assertActive(): void {
    if (this.closed || Date.now() >= this.deadline)
      this.abort('Scraping execution deadline ended');
    this.signal.throwIfAborted();
    this.parent?.assertActive();
  }
  readonly guard: WriteFence = async (tx) => {
    this.assertActive();
    await this.parent?.guard(tx);
    await this.owned(tx);
    this.assertActive();
  };
  private scheduleHeartbeat(): void {
    if (this.closed || this.signal.aborted) return;
    this.heartbeat = setTimeout(() => {
      this.renewal = this.tick();
    }, this.heartbeatMs);
    this.heartbeat.unref();
  }
  private async tick(): Promise<void> {
    try {
      this.assertActive();
      if (!(await this.renew()))
        this.abort('Scraping lease is no longer owned');
    } catch {
      this.abort('Scraping lease renewal failed');
    }
    this.scheduleHeartbeat();
  }
  async run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertActive();
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        const reason: unknown = this.signal.reason;
        reject(
          reason instanceof Error
            ? reason
            : new ConflictException('Scraping lease ended'),
        );
      };
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([work(this.signal), aborted]);
    } finally {
      this.signal.removeEventListener('abort', onAbort);
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timeout);
    if (this.heartbeat) clearTimeout(this.heartbeat);
    if (this.parentAbort)
      this.parent?.signal.removeEventListener('abort', this.parentAbort);
    this.abort('Scraping lease closed');
    await this.renewal;
  }
}
