-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" SERIAL NOT NULL,
    "trigger" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "expectedLocations" INTEGER NOT NULL DEFAULT 0,
    "locationsSucceeded" INTEGER NOT NULL DEFAULT 0,
    "locationsFailed" INTEGER NOT NULL DEFAULT 0,
    "showtimesInserted" INTEGER NOT NULL DEFAULT 0,
    "showtimesUnchanged" INTEGER NOT NULL DEFAULT 0,
    "failedChains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summaryJson" JSONB,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapeRun_completedAt_idx" ON "ScrapeRun"("completedAt" DESC);
