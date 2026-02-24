import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Interfaz para nuestras correcciones manuales
interface ManualFix {
  lat: number;
  lng: number;
  address: string;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private prisma: PrismaService) {}

  // 1. DICCIONARIO CON DIRECCIONES REALES
  private readonly manualOverrides: Record<string, ManualFix> = {
    // --- SHOWCASE ---
    'Showcase Norcenter': { lat: -34.5218, lng: -58.5136, address: 'Esteban Echeverría 3750' },
    'Showcase Córdoba': { lat: -31.3965, lng: -64.2163, address: 'José de Goyechea 2851' },
    'Showcase Villa Allende': { lat: -31.2953, lng: -64.2957, address: 'Río de Janeiro 1725' },
    'Showcase Haedo': { lat: -34.6388, lng: -58.5801, address: 'Av. Dr. Luis Güemes 369' },
    'Showcase Belgrano': { lat: -34.5535, lng: -58.4532, address: 'Monroe 1655' },
    'Showcase Rosario': { lat: -32.9280, lng: -60.6678, address: 'Junín 501' },
    'Showcase Quilmes': { lat: -34.7251, lng: -58.2556, address: 'Humberto Primo 250' },

    // --- ATLAS ---
    'Atlas Patio Bullrich': { lat: -34.5886, lng: -58.3842, address: 'Posadas 1245' },
    'Atlas Alcorta': { lat: -34.5765, lng: -58.4042, address: 'Jerónimo Salguero 3172' },
    'Atlas Caballito': { lat: -34.6183, lng: -58.4374, address: 'Av. Rivadavia 5071' },
    'Atlas Flores': { lat: -34.6292, lng: -58.4621, address: 'Av. Rivadavia 7850' },
    'Atlas Liniers': { lat: -34.6399, lng: -58.5268, address: 'Av. Rivadavia 11650' },
    'Atlas Nordelta': { lat: -34.3990, lng: -58.6531, address: 'Av. De Los Lagos 7010' },
    'Atlas Catan': { lat: -34.7632, lng: -58.6194, address: 'Juan Manuel de Rosas 14457' },

    // --- CINEMA CENTER ---
    'Cinema Center Bahía Blanca': { lat: -38.7187, lng: -62.2666, address: 'Sarmiento 2153' },
    'Cinema Center Corrientes': { lat: -27.4852, lng: -58.8033, address: 'Av. Raúl Alfonsín 3525' },
    'Cinema Center Mar del Plata': { lat: -37.9991, lng: -57.5456, address: 'Diagonal Pueyrredon 3050' },
    'Cinema Center San Luis': { lat: -33.3030, lng: -66.3356, address: 'Av. del Fundador 1450' },
    'Cinema Center San Juan': { lat: -31.5543, lng: -68.5284, address: 'Av. Circunvalación 105' },
    'Cinema Center Mendoza': { lat: -32.9162, lng: -68.8222, address: 'Las Cañas 1833' },
    'Cinema Center Tandil': { lat: -37.3134, lng: -59.1292, address: 'Panamá 351' },
    'Cinema Center Florencio Varela': { lat: -34.8093, lng: -58.2694, address: 'Av. San Martín 2599' },
    'Cinema Center Resistencia': { lat: -27.4374, lng: -58.9836, address: 'Av. Avalos 1400' },
    'Cinema Center Tucumán': { lat: -26.8335, lng: -65.2045, address: 'Av. Néstor Kirchner 3450' },
    'Cinema Center La Rioja': { lat: -29.4131, lng: -66.8558, address: 'Av. Ortiz de Ocampo 1850' },
    'Cinema Center Río Cuarto': { lat: -33.1235, lng: -64.3486, address: 'Av. Marcelo T. de Alvear 1250' },
    'Cinema Center Catamarca': { lat: -28.4687, lng: -65.8016, address: 'Av. Acosta Villafañe 2450' },
    'Cinema Center Alta Gracia': { lat: -31.6528, lng: -64.4284, address: 'Av. Belgrano 450' },
  };

  async updateCinemasCoordinates() {
    // AHORA: Buscamos TODOS los cines que tengan dirección "fea" ("Ver Web")
    // O coordenadas en 0. Queremos arreglar todo.
    const cinemas = await this.prisma.cinemaLocation.findMany({
      where: {
        OR: [
            { lat: 0 },
            { address: { contains: 'Ver' } }, // Busca "Ver web", "Ver sitio", etc.
            { address: { contains: 'Web' } }
        ]
      },
    });

    this.logger.log(`📍 Iniciando actualización masiva para ${cinemas.length} cines...`);

    for (const cinema of cinemas) {
      if (this.manualOverrides[cinema.name]) {
        const fix = this.manualOverrides[cinema.name];
        
        await this.prisma.cinemaLocation.update({
            where: { id: cinema.id },
            data: { 
                lat: fix.lat, 
                lng: fix.lng,
                address: fix.address // <--- ACTUALIZAMOS LA DIRECCIÓN TAMBIÉN
            },
        });
        this.logger.log(`✅ MANUAL FIX COMPLETO: ${cinema.name}`);
      }
    }

    return { message: 'Direcciones y coordenadas actualizadas.' };
  }
}