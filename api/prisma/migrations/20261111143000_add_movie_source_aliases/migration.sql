-- Additive source identity mapping; existing movies/showtimes remain unchanged.
CREATE TABLE "MovieAlias" (
  "key" TEXT NOT NULL,
  "movieId" INTEGER NOT NULL,
  "originalTitle" TEXT NOT NULL,
  CONSTRAINT "MovieAlias_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "MovieAlias_movieId_idx" ON "MovieAlias"("movieId");
ALTER TABLE "MovieAlias" ADD CONSTRAINT "MovieAlias_movieId_fkey"
  FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
