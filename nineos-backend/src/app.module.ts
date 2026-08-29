import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { AutomationModule } from './modules/automation/automation.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { SocialModule } from './modules/social/social.module';
import { VirtualOfficeModule } from './modules/virtual-office/virtual-office.module';
import { AgentModule } from './modules/agent/agent.module';
import { WatcherModule } from './modules/watcher/watcher.module';
import { WebhooksController } from './modules/platforms/webhooks.controller';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    PlatformsModule,
    AutomationModule,
    HelpdeskModule,
    SocialModule,
    VirtualOfficeModule,
    AgentModule,
    WatcherModule,
  ],
  controllers: [AppController, WebhooksController],
})
export class AppModule {}
