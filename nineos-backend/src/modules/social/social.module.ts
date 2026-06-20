import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

@Module({
  controllers: [SocialController],
  providers: [SocialService, EncryptionService],
  exports: [SocialService],
})
export class SocialModule {}
