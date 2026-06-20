import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

@Module({
  controllers: [PlatformsController],
  providers: [PlatformsService, EncryptionService],
  exports: [PlatformsService],
})
export class PlatformsModule {}
