import { Module } from '@nestjs/common';
import { VirtualOfficeController } from './virtual-office.controller';
import { VirtualOfficeService } from './virtual-office.service';

@Module({
  controllers: [VirtualOfficeController],
  providers: [VirtualOfficeService],
  exports: [VirtualOfficeService],
})
export class VirtualOfficeModule {}
