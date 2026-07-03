import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';
import { PlatformKpiService } from './platform-kpi.service';

@Module({
  controllers: [PlatformsController],
  providers: [PlatformsService, PlatformKpiService],
  exports: [PlatformsService, PlatformKpiService],
})
export class PlatformsModule {}
