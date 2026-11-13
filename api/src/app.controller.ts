import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Estado ligero de actividad del servicio API (liveness)',
  })
  getStatus() {
    return this.appService.getLivenessStatus();
  }

  @Get('health')
  @ApiOperation({
    summary:
      'Readiness y frescura de cartelera para monitoreo y orquestadores (Railway)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Base conectada; frescura por cadena y estado de métricas separados de readiness (pueden estar degradados con HTTP 200)',
  })
  @ApiResponse({
    status: 503,
    description: 'Base de datos inaccesible',
  })
  getHealth() {
    return this.appService.getHealthStatus();
  }
}
