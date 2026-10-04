import { Module } from '@nestjs/common';
import { PlatformsModule } from '../platforms/platforms.module';
import { AgentController } from './agent.controller';
import { NotifyController } from './notify.controller';
import { AiUsageController } from './ai-usage.controller';
import { AgentToolsService } from './agent-tools.service';
import { AgentRunnerService } from './agent-runner.service';

// Lapisan agentic: registry tool + loop eksekusi + antrian approval.
// PlatformsModule diimpor demi PlatformKpiService (jembatan ke NotaBe/Krama).
@Module({
  imports: [PlatformsModule],
  controllers: [AgentController, NotifyController, AiUsageController],
  providers: [AgentToolsService, AgentRunnerService],
  exports: [AgentToolsService, AgentRunnerService],
})
export class AgentModule {}
