-- Synchronize database schema with Prisma datamodel (F04)
-- Safely upgrades databases initialized from 20260222170935_init_cinema_schema
-- while preserving existing rows and deduplicating before adding unique constraints.

-- DropForeignKey (will be recreated with ON DELETE CASCADE)
ALTER TABLE "CinemaLocation" DROP CONSTRAINT "CinemaLocation_chainId_fkey";

-- DropForeignKey
ALTER TABLE "Showtime" DROP CONSTRAINT "Showtime_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Showtime" DROP CONSTRAINT "Showtime_movieId_fkey";

-- AlterTable: CinemaLocation
ALTER TABLE "CinemaLocation"
ADD COLUMN "city" TEXT NOT NULL DEFAULT 'Buenos Aires',
ADD COLUMN "externalId" TEXT,
ADD COLUMN "url" TEXT,
ADD COLUMN "zone" TEXT NOT NULL DEFAULT 'CABA';

-- AlterTable: Movie (use temporary DEFAULT on updatedAt to backfill existing rows safely)
ALTER TABLE "Movie"
ADD COLUMN "backdropUrl" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "overview" TEXT,
ADD COLUMN "releaseDate" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Movie" ALTER COLUMN "updatedAt" DROP DEFAULT;

UPDATE "Movie" SET "genres" = ARRAY[]::TEXT[] WHERE "genres" IS NULL;

-- Pre-constraint cleanup 1: remove exact duplicate showtimes keeping lowest id
DELETE FROM "Showtime" a
USING "Showtime" b
WHERE a."id" > b."id"
  AND a."movieId" = b."movieId"
  AND a."locationId" = b."locationId"
  AND a."dateTime" = b."dateTime"
  AND a."format" = b."format"
  AND a."language" = b."language";

-- Pre-constraint cleanup 2: merge duplicate CinemaLocation (name, chainId) rows keeping lowest id
WITH canonical_locations AS (
  SELECT "name", "chainId", MIN("id") AS keep_id
  FROM "CinemaLocation"
  GROUP BY "name", "chainId"
  HAVING COUNT(*) > 1
)
UPDATE "Showtime" s
SET "locationId" = c.keep_id
FROM "CinemaLocation" l
JOIN canonical_locations c
  ON l."name" = c."name" AND l."chainId" = c."chainId"
WHERE s."locationId" = l."id"
  AND l."id" <> c.keep_id;

-- Re-deduplicate Showtime in case merging duplicate locations produced identical showtime tuples
DELETE FROM "Showtime" a
USING "Showtime" b
WHERE a."id" > b."id"
  AND a."movieId" = b."movieId"
  AND a."locationId" = b."locationId"
  AND a."dateTime" = b."dateTime"
  AND a."format" = b."format"
  AND a."language" = b."language";

DELETE FROM "CinemaLocation" a
USING "CinemaLocation" b
WHERE a."id" > b."id"
  AND a."name" = b."name"
  AND a."chainId" = b."chainId";

-- CreateIndex
CREATE INDEX "CinemaLocation_chainId_idx" ON "CinemaLocation"("chainId");

-- CreateIndex
CREATE INDEX "CinemaLocation_zone_idx" ON "CinemaLocation"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaLocation_name_chainId_key" ON "CinemaLocation"("name", "chainId");

-- CreateIndex
CREATE INDEX "Showtime_dateTime_idx" ON "Showtime"("dateTime");

-- CreateIndex
CREATE INDEX "Showtime_movieId_dateTime_idx" ON "Showtime"("movieId", "dateTime");

-- CreateIndex
CREATE INDEX "Showtime_locationId_dateTime_idx" ON "Showtime"("locationId", "dateTime");

-- CreateIndex
CREATE UNIQUE INDEX "Showtime_movieId_locationId_dateTime_format_language_key" ON "Showtime"("movieId", "locationId", "dateTime", "format", "language");

-- AddForeignKey
ALTER TABLE "CinemaLocation" ADD CONSTRAINT "CinemaLocation_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "CinemaChain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CinemaLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
