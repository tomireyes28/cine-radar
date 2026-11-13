import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { ApiRequestError, apiGet, getNowPlaying } from "./api.ts";

async function withServer(
  handler: RequestListener,
  work: (url: string) => Promise<void>,
) {
  const server = createServer(handler);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
}

function errorKind(kind: ApiRequestError["kind"], status?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.kind, kind);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  };
}

describe("R07 timeout includes response body consumption", () => {
  for (const status of [404, 429, 503]) {
    it(
      `closes an unread ${status} response body without changing its status semantics`,
      { timeout: 5000 },
      async () => {
        let markClosed!: () => void;
        const closed = new Promise<void>((resolve) => {
          markClosed = resolve;
        });
        await withServer(
          (_request, response) => {
            response.once("close", markClosed);
            response.writeHead(status, { "content-type": "application/json" });
            response.flushHeaders();
            response.write("{");
          },
          async (apiBaseUrl) => {
            const request = apiGet("/unread", {}, 0, { apiBaseUrl });
            if (status === 404) assert.equal(await request, null);
            else
              await assert.rejects(
                request,
                errorKind(
                  status === 429 ? "rate_limited" : "upstream_http",
                  status,
                ),
              );
            await closed;
          },
        );
      },
    );
  }
  it(
    "aborts a real response that sends headers then never finishes its JSON body",
    { timeout: 5000 },
    async () => {
      let headersRead = false;
      let signal: AbortSignal | null | undefined;
      let markClosed!: () => void;
      const bodyClosed = new Promise<void>((resolve) => {
        markClosed = resolve;
      });
      await withServer(
        (_request, response) => {
          response.once("close", markClosed);
          response.writeHead(200, { "content-type": "application/json" });
          response.flushHeaders();
          response.write("[");
        },
        async (apiBaseUrl) => {
          const fetchImpl: typeof fetch = async (url, init) => {
            signal = init?.signal;
            const response = await fetch(url, init);
            headersRead = true;
            return response;
          };
          await assert.rejects(
            getNowPlaying({}, { apiBaseUrl, fetchImpl, timeoutMs: 250 }),
            errorKind("timeout", 200),
          );
          assert.equal(headersRead, true);
          assert.equal(signal?.aborted, true);
          await bodyClosed;
        },
      );
    },
  );
  it("keeps genuine JSON syntax errors distinct from timeouts", async () => {
    await withServer(
      (_request, response) => {
        response.end("{not json");
      },
      async (apiBaseUrl) => {
        await assert.rejects(
          getNowPlaying({}, { apiBaseUrl }),
          errorKind("invalid_json", 200),
        );
      },
    );
  });
  it("classifies a connection cut during body transfer as a network error", async () => {
    let cut!: () => void;
    await withServer(
      (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.flushHeaders();
        response.write("[");
        cut = () => response.destroy();
      },
      async (apiBaseUrl) => {
        const fetchImpl: typeof fetch = async (url, init) => {
          const response = await fetch(url, init);
          cut();
          return response;
        };
        await assert.rejects(
          getNowPlaying({}, { apiBaseUrl, fetchImpl }),
          errorKind("network", 200),
        );
      },
    );
  });
  it("clears the deadline after a successful body read", async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = (_url, init) => {
      signal = init?.signal;
      return Promise.resolve(new Response("[]"));
    };
    assert.deepEqual(
      await getNowPlaying(
        {},
        { apiBaseUrl: "http://unused.test", fetchImpl, timeoutMs: 100 },
      ),
      [],
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(signal?.aborted, false);
  });
  it("does not return a late success from a transport that ignored cancellation", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return [];
        },
      } as Response);
    await assert.rejects(
      getNowPlaying(
        {},
        { apiBaseUrl: "http://unused.test", fetchImpl, timeoutMs: 10 },
      ),
      errorKind("timeout", 200),
    );
  });
  for (const timeoutMs of [0, Infinity, NaN]) {
    it(`rejects an invalid timeout (${timeoutMs}) before making a request`, async () => {
      const fetchImpl: typeof fetch = () => {
        throw new Error("must not fetch");
      };
      await assert.rejects(
        getNowPlaying(
          {},
          { apiBaseUrl: "http://unused.test", fetchImpl, timeoutMs },
        ),
        errorKind("misconfigured"),
      );
    });
  }
});
