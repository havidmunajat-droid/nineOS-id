import { Global, Module } from '@nestjs/common';
import { AIService } from './ai/ai.service';
import { EncryptionService } from './crypto/encryption.service';
import { MediaGenerationService } from './media/media-generation.service';
import { StorageService } from './storage/storage.service';
import { NotifierService } from './notify/notifier.service';

// Service lintas-modul didaftarkan SEKALI di sini (@Global),
// jangan tambahkan lagi ke providers feature module — nanti instance-nya ganda.
@Global()
@Module({
  providers: [AIService, EncryptionService, MediaGenerationService, StorageService, NotifierService],
  exports: [AIService, EncryptionService, MediaGenerationService, StorageService, NotifierService],
})
export class CommonModule {}
