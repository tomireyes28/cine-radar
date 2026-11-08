import {
  Controller,
  ForbiddenException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { ScraperOrchestratorService } from './services/scraper-orchestrator.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('scraper')
@ApiSecurity('admin-api-key')
@Controller('scraper')
@UseGuards(ApiKeyGuard)
export class ScraperController {
  constructor(private readonly orchestrator: ScraperOrchestratorService) {}

  private ensureHttpScraperEnabled(): void {
    if (process.env.ENABLE_HTTP_SCRAPER !== 'true') {
      throw new ForbiddenException(
        'Los endpoints HTTP de scraping están deshabilitados. Defina ENABLE_HTTP_SCRAPER=true o ejecute el worker CLI.',
      );
    }
  }

  @Post('run-all')
  @ApiOperation({
    summary: 'Ejecutar orquestación completa de todas las cadenas (Admin)',
    description:
      'Requiere encabezado x-api-key válido y ENABLE_HTTP_SCRAPER=true. Protegido por bloqueo distribuido.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen de funciones insertadas por cadena',
  })
  @ApiResponse({
    status: 401,
    description: 'Clave API no proporcionada o inválida',
  })
  @ApiResponse({
    status: 403,
    description: 'Ejecución HTTP deshabilitada (ENABLE_HTTP_SCRAPER != true)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una ejecución de scraping en curso',
  })
  async runAll() {
    this.ensureHttpScraperEnabled();
    return this.orchestrator.runAll();
  }

  @Post(':chainKey')
  @ApiOperation({
    summary: 'Ejecutar scraper para una cadena específica (Admin)',
  })
  @ApiParam({
    name: 'chainKey',
    description:
      'Identificador de la cadena: cinemark, cinepolis, showcase, cinemacenter, atlas, multiplex',
    example: 'cinemark',
  })
  @ApiResponse({ status: 200, description: 'Resumen de funciones insertadas' })
  @ApiResponse({
    status: 401,
    description: 'Clave API no proporcionada o inválida',
  })
  @ApiResponse({
    status: 403,
    description: 'Ejecución HTTP deshabilitada (ENABLE_HTTP_SCRAPER != true)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una ejecución activa para esta cadena o global',
  })
  async runByChain(@Param('chainKey') chainKey: string) {
    this.ensureHttpScraperEnabled();
    return this.orchestrator.runByChainKey(chainKey);
  }
}
