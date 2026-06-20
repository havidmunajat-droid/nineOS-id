import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';
import { PlatformKpiService } from './platform-kpi.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

@Module({
  controllers: [PlatformsController],
  providers: [PlatformsService, PlatformKpiService, EncryptionService],
  exports: [PlatformsService, PlatformKpiService],
})
export class PlatformsModule {}
