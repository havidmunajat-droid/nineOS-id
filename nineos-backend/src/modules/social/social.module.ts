import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AIService } from '../../common/ai/ai.service';
import { MediaGenerationService } from '../../common/media/media-generation.service';

@Module({
  controllers: [SocialController],
  providers: [SocialService, EncryptionService, AIService, MediaGenerationService],
  exports: [SocialService],
})
export class SocialModule {}
