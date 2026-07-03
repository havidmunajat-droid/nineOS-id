import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Health check API gateway (untuk uptime monitor / Railway healthcheck)' })
  health() {
    return {
      status: 'ok',
      service: 'nineos-api',
      version: '1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
