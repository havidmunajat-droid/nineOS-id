import { Module } from '@nestjs/common';
import { PlatformsModule } from '../platforms/platforms.module';
import { AgentController } from './agent.controller';
import { AgentToolsService } from './agent-tools.service';
import { AgentRunnerService } from './agent-runner.service';

// Lapisan agentic: registry tool + loop eksekusi + antrian approval.
// PlatformsModule diimpor demi PlatformKpiService (jembatan ke NotaBe/Krama).
@Module({
  imports: [PlatformsModule],
  controllers: [AgentController],
  providers: [AgentToolsService, AgentRunnerService],
  exports: [AgentToolsService, AgentRunnerService],
})
export class AgentModule {}
