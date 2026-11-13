async function seed(db) {
  await db.$executeRawUnsafe(
    'TRUNCATE "Showtime","MovieAlias","Movie","CinemaLocation","CinemaChain" RESTART IDENTITY CASCADE',
  );
  await db.cinemaChain.create({ data: { id: 1, name: "Cadena de prueba" } });
  await db.cinemaLocation.createMany({
    data: [
      {
        id: 10,
        name: "Sala de prueba",
        address: "Dirección de prueba",
        city: "Córdoba",
        zone: "CABA",
        lat: -34.6,
        lng: -58.4,
        chainId: 1,
      },
      {
        id: 11,
        name: "Otra sala",
        address: "Otra dirección",
        city: "Ciudad 100%_\\",
        zone: "Interior",
        lat: -31.4,
        lng: -64.2,
        chainId: 1,
      },
    ],
  });
  await db.movie.createMany({
    data: [
      {
        id: 1,
        title: "Película de prueba",
        normalizedKey: "fixture",
        genres: ["Drama"],
        overview: "Sinopsis controlada.",
      },
      { id: 2, title: "Otra película", normalizedKey: "fixture2" },
    ],
  });
  await db.showtime.createMany({
    data: [
      {
        id: 1,
        movieId: 1,
        locationId: 10,
        dateTime: new Date("2099-01-01T23:00:00Z"),
        format: "2D",
        language: "SUB",
        ticketUrl: "https://tickets.example.test/1",
      },
      {
        id: 2,
        movieId: 1,
        locationId: 11,
        dateTime: new Date("2099-01-02T02:59:59.999Z"),
        format: "3D",
        language: "DOB",
        ticketUrl: "https://tickets.example.test/2",
      },
      {
        id: 3,
        movieId: 2,
        locationId: 10,
        dateTime: new Date("2099-01-02T03:00:00Z"),
        format: "2D",
        language: "SUB",
        ticketUrl: "https://tickets.example.test/3",
      },
    ],
  });
}
module.exports = { seed };
