import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  @Post(':slug/:capability')
  @ApiOperation({ summary: 'Penerima webhook dari backend platform (divalidasi via HMAC)' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  @ApiParam({ name: 'capability', example: 'content' })
  async receiveWebhook(
    @Param('slug') slug: string,
    @Param('capability') capability: string,
    @Headers('x-nineos-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    const platform = await this.prisma.platform.findUnique({ where: { slug } });
    if (!platform) throw new BadRequestException(`Platform '${slug}' tidak ditemukan`);

    const connection = await this.prisma.platformConnection.findFirst({
      where: { platformId: platform.id },
      orderBy: { createdAt: 'desc' },
    });

    if (connection?.webhookSecretEncrypted) {
      const secret = this.encryption.decrypt(connection.webhookSecretEncrypted);
      const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');

      if (signature !== `sha256=${expected}`) {
        throw new BadRequestException('Signature tidak valid');
      }
    }

    // Log sebagai automation job untuk audit trail
    await this.prisma.automationSyncJob.create({
      data: {
        platformId: platform.id,
        jobType: `webhook_${capability}`,
        triggeredBy: 'n8n',
        payload: body as object,
        status: 'running',
      },
    });

    return { received: true, platform: slug, capability };
  }
}
