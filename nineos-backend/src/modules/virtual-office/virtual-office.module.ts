import { Module } from '@nestjs/common';
import { VirtualOfficeController } from './virtual-office.controller';
import { VirtualOfficeService } from './virtual-office.service';
import { AIService } from '../../common/ai/ai.service';

@Module({
  controllers: [VirtualOfficeController],
  providers: [VirtualOfficeService, AIService],
  exports: [VirtualOfficeService, AIService],
})
export class VirtualOfficeModule {}
