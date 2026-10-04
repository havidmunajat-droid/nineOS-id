import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { PlatformWatcherService } from './platform-watcher.service';
import { WatcherController } from './watcher.controller';

// Agent proaktif: cron snapshot KPI + deteksi anomali + laporan malam 22:00 WIB.
@Module({
  imports: [PlatformsModule, AgentModule],
  controllers: [WatcherController],
  providers: [PlatformWatcherService],
  exports: [PlatformWatcherService],
})
export class WatcherModule {}
