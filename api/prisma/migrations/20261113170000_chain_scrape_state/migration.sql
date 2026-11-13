-- Historical runs do not prove current per-chain coverage. Start unknown;
-- the next verified extraction populates each compact checkpoint.
CREATE TABLE "ChainScrapeState" (
    "chainKey" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "expectedLocations" INTEGER NOT NULL,
    "verifiedLocations" INTEGER NOT NULL,
    "emptyVerifiedLocations" INTEGER NOT NULL,
    CONSTRAINT "ChainScrapeState_pkey" PRIMARY KEY ("chainKey")
);
