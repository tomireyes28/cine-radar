import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealthStatus() {
    return {
      status: 'ok',
      service: 'cine-radar-api',
      timestamp: new Date().toISOString(),
    };
  }
}
