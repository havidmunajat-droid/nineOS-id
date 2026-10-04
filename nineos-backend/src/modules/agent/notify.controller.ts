import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { NotifierService } from '../../common/notify/notifier.service';

// Pemasangan notifikasi Telegram, dipakai sekali saat setup:
//   1. isi TELEGRAM_BOT_TOKEN di Railway, kirim /start ke bot
//   2. GET  /agent/notify/discover → dapat chat_id
//   3. isi TELEGRAM_CHAT_ID di Railway
//   4. POST /agent/notify/test     → pesan uji masuk ke HP
@ApiTags('Agent Notify')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('agent/notify')
export class NotifyController {
  constructor(private readonly notifier: NotifierService) {}

  @Get('status')
  @ApiOperation({ summary: 'Apakah notifikasi Telegram sudah terpasang' })
  status() {
    return {
      configured: this.notifier.configured,
      has_bot_token: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      has_chat_id: Boolean(process.env.TELEGRAM_CHAT_ID),
    };
  }

  @Get('discover')
  @ApiOperation({ summary: 'Cari chat_id dari pesan terakhir yang dikirim ke bot (kirim /start dulu)' })
  async discover() {
    const chats = await this.notifier.discoverChats();
    return {
      count: chats.length,
      chats,
      hint:
        chats.length === 0
          ? 'Belum ada pesan masuk. Buka bot di Telegram, kirim /start, lalu panggil endpoint ini lagi.'
          : 'Salin chat_id milik kapten ke variable TELEGRAM_CHAT_ID di Railway, lalu Deploy.',
    };
  }

  @Post('test')
  @ApiOperation({ summary: 'Kirim pesan uji ke Telegram kapten' })
  async test() {
    const sent = await this.notifier.alert(
      'ok',
      'NineOS terhubung ke Telegram',
      'Mulai sekarang kapten akan menerima: platform mati & pulih, SOS dan order tertahan di Krama, anomali penting, permintaan persetujuan AI, dan Laporan Malam pukul 22:00 WIB.',
    );
    return {
      sent,
      hint: sent ? 'Cek Telegram kapten.' : 'Gagal — cek /agent/notify/status dan log Railway.',
    };
  }
}
