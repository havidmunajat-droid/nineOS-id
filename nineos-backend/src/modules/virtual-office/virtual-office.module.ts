import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { VirtualOfficeController } from './virtual-office.controller';
import { VirtualOfficeService } from './virtual-office.service';

@Module({
  imports: [AgentModule],
  controllers: [VirtualOfficeController],
  providers: [VirtualOfficeService],
  exports: [VirtualOfficeService],
})
export class VirtualOfficeModule {}
