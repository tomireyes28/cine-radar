-- CreateTable
CREATE TABLE "ScraperLock" (
    "lockKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperLock_pkey" PRIMARY KEY ("lockKey")
);

-- CreateIndex
CREATE INDEX "ScraperLock_expiresAt_idx" ON "ScraperLock"("expiresAt");
