-- Decouple internal movie identity from nullable TMDB enrichment (F08)
-- Replaces synthetic negative 32-bit hashes in tmdbId with collision-free normalizedKey.

ALTER TABLE "Movie" ALTER COLUMN "tmdbId" DROP NOT NULL;

ALTER TABLE "Movie"
ADD COLUMN "normalizedKey" TEXT,
ADD COLUMN "tmdbStatus" TEXT NOT NULL DEFAULT 'pending';

-- Convert legacy negative synthetic hashes to NULL and classify status
UPDATE "Movie"
SET "tmdbId" = NULL,
    "tmdbStatus" = 'not_found'
WHERE "tmdbId" IS NOT NULL AND "tmdbId" < 0;

UPDATE "Movie"
SET "tmdbStatus" = 'matched'
WHERE "tmdbId" IS NOT NULL AND "tmdbId" > 0;

-- Backfill normalizedKey deterministically, disambiguating any pre-existing duplicate titles
WITH ranked_movies AS (
  SELECT
    "id",
    COALESCE(NULLIF(LOWER(BTRIM("title")), ''), 'movie-' || "id"::TEXT) AS base_key,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM("title"))
      ORDER BY "id" ASC
    ) AS rn
  FROM "Movie"
)
UPDATE "Movie" m
SET "normalizedKey" = CASE
  WHEN r.rn = 1 THEN r.base_key
  ELSE r.base_key || '-' || m."id"::TEXT
END
FROM ranked_movies r
WHERE m."id" = r."id";

ALTER TABLE "Movie" ALTER COLUMN "normalizedKey" SET NOT NULL;

CREATE UNIQUE INDEX "Movie_normalizedKey_key" ON "Movie"("normalizedKey");
