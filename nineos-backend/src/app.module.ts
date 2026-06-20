import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { AutomationModule } from './modules/automation/automation.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { SocialModule } from './modules/social/social.module';
import { VirtualOfficeModule } from './modules/virtual-office/virtual-office.module';
import { WebhooksController } from './modules/platforms/webhooks.controller';
import { EncryptionService } from './common/crypto/encryption.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PlatformsModule,
    AutomationModule,
    HelpdeskModule,
    SocialModule,
    VirtualOfficeModule,
  ],
  controllers: [WebhooksController],
  providers: [EncryptionService],
})
export class AppModule {}
