-- CreateTable
CREATE TABLE "Movie" (
    "id" SERIAL NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "posterUrl" TEXT,
    "duration" INTEGER,
    "rating" TEXT,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaChain" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,

    CONSTRAINT "CinemaChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaLocation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "chainId" INTEGER NOT NULL,

    CONSTRAINT "CinemaLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Showtime" (
    "id" SERIAL NOT NULL,
    "movieId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "ticketUrl" TEXT NOT NULL,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaChain_name_key" ON "CinemaChain"("name");

-- AddForeignKey
ALTER TABLE "CinemaLocation" ADD CONSTRAINT "CinemaLocation_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "CinemaChain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CinemaLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
