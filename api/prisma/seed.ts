import { PrismaClient } from '@prisma/client';
import { CINEMARK_LOCATIONS } from '../src/scraper/cinemark/cinemark.locations';
import { CINEPOLIS_LOCATIONS } from '../src/scraper/cinepolis/cinepolis.locations';
import { SHOWCASE_LOCATIONS } from '../src/scraper/showcase/showcase.locations';
import { ATLAS_LOCATIONS } from '../src/scraper/atlas/atlas.locations';
import { MULTIPLEX_LOCATIONS } from '../src/scraper/multiplex/multiplex.locations';
import { CINEMACENTER_CITIES } from '../src/scraper/cinemacenter/cinemacenter.locations';

const prisma = new PrismaClient();

interface SeedLocationItem {
  name: string;
  address: string;
  zone: string;
  city: string;
  lat: number;
  lng: number;
  externalId?: string;
  url?: string;
}

async function seedChain(chainName: string, locations: SeedLocationItem[]) {
  const chain = await prisma.cinemaChain.upsert({
    where: { name: chainName },
    update: {},
    create: { name: chainName },
  });

  // Deduplicate by location name (e.g. Showcase Norcenter + IMAX mapped to same venue)
  const uniqueByName = new Map<string, SeedLocationItem>();
  for (const loc of locations) {
    if (!uniqueByName.has(loc.name)) {
      uniqueByName.set(loc.name, loc);
    }
  }

  for (const loc of uniqueByName.values()) {
    await prisma.cinemaLocation.upsert({
      where: {
        name_chainId: {
          name: loc.name,
          chainId: chain.id,
        },
      },
      update: {
        address: loc.address,
        zone: loc.zone,
        city: loc.city,
        lat: loc.lat,
        lng: loc.lng,
        externalId: loc.externalId,
        url: loc.url,
      },
      create: {
        name: loc.name,
        address: loc.address,
        zone: loc.zone,
        city: loc.city,
        lat: loc.lat,
        lng: loc.lng,
        externalId: loc.externalId,
        url: loc.url,
        chainId: chain.id,
      },
    });
  }

  console.log(`✔ Seeded ${uniqueByName.size} locations for chain: ${chainName}`);
}

async function main() {
  console.log('🌱 Starting declarative cinema catalog seed...');

  await seedChain(
    'Cinemark',
    CINEMARK_LOCATIONS.map((l) => ({
      name: l.name,
      address: l.address,
      zone: l.zone,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      url: l.url,
    })),
  );

  await seedChain(
    'Cinépolis',
    CINEPOLIS_LOCATIONS.map((l) => ({
      name: l.name,
      address: l.address,
      zone: l.zone,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      externalId: String(l.complexId),
      url: l.url,
    })),
  );

  await seedChain(
    'Showcase',
    SHOWCASE_LOCATIONS.map((l) => ({
      name: l.name,
      address: l.address,
      zone: l.zone,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      url: l.url,
    })),
  );

  await seedChain(
    'Atlas Cines',
    ATLAS_LOCATIONS.map((l) => ({
      name: l.name,
      address: l.address,
      zone: l.zone,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      externalId: String(l.complexId),
      url: l.url,
    })),
  );

  await seedChain(
    'Multiplex',
    MULTIPLEX_LOCATIONS.map((l) => ({
      name: l.name,
      address: l.address,
      zone: l.zone,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      externalId: l.complexId,
      url: 'https://multiplex.com.ar/',
    })),
  );

  await seedChain(
    'Cinema Center',
    CINEMACENTER_CITIES.map((l) => ({
      name: l.name,
      address: l.address,
      zone: l.zone,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      externalId: String(l.cityId),
      url: 'https://www.cinemacenter.com.ar/horarios',
    })),
  );

  console.log('✅ Cinema catalog seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
