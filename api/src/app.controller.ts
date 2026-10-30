import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Estado del servicio API' })
  getStatus() {
    return this.appService.getHealthStatus();
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check para monitoreo y orquestadores (Railway)' })
  @ApiResponse({ status: 200, description: 'Servicio en estado saludable' })
  getHealth() {
    return this.appService.getHealthStatus();
  }
}
