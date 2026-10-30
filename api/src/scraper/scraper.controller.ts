import { Controller, Param, Post, UseGuards } from '@nestjs/common';
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
  constructor(
    private readonly orchestrator: ScraperOrchestratorService,
  ) {}

  @Post('run-all')
  @ApiOperation({
    summary: 'Ejecutar orquestación completa de todas las cadenas (Admin)',
    description: 'Requiere encabezado x-api-key válido. Ejecuta secuencialmente los scrapers y limpia funciones antiguas.',
  })
  @ApiResponse({ status: 200, description: 'Resumen de funciones insertadas por cadena' })
  @ApiResponse({ status: 401, description: 'Clave API no proporcionada o inválida' })
  async runAll() {
    return this.orchestrator.runAll();
  }

  @Post(':chainKey')
  @ApiOperation({
    summary: 'Ejecutar scraper para una cadena específica (Admin)',
  })
  @ApiParam({
    name: 'chainKey',
    description: 'Identificador de la cadena: cinemark, cinepolis, showcase, cinemacenter, atlas, multiplex',
    example: 'cinemark',
  })
  @ApiResponse({ status: 200, description: 'Resumen de funciones insertadas' })
  @ApiResponse({ status: 401, description: 'Clave API no proporcionada o inválida' })
  async runByChain(@Param('chainKey') chainKey: string) {
    return this.orchestrator.runByChainKey(chainKey);
  }
}
