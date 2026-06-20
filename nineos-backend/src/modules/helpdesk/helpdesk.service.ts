import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateKbDto, EscalateDto, InboundMessageDto,
  OutboundMessageDto, UpdateKbDto, UpdateSettingsDto,
} from './dto/helpdesk.dto';

@Injectable()
export class HelpdeskService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Settings ──────────────────────────────────────────────────

  async getSettings(slug: string) {
    const platform = await this.requirePlatform(slug);
    const settings = await this.prisma.helpdeskSettings.findUnique({ where: { platformId: platform.id } });
    if (!settings) throw new NotFoundException(`Settings untuk '${slug}' belum disiapkan`);
    return this.formatSettings(settings);
  }

  async updateSettings(slug: string, dto: UpdateSettingsDto) {
    const platform = await this.requirePlatform(slug);
    const settings = await this.prisma.helpdeskSettings.upsert({
      where: { platformId: platform.id },
      update: {
        ...(dto.auto_reply_enabled !== undefined && { autoReplyEnabled: dto.auto_reply_enabled }),
        ...(dto.confidence_threshold !== undefined && { confidenceThreshold: dto.confidence_threshold }),
        ...(dto.escalation_keywords !== undefined && { escalationKeywords: dto.escalation_keywords }),
        ...(dto.fallback_message !== undefined && { fallbackMessage: dto.fallback_message }),
      },
      create: {
        platformId: platform.id,
        autoReplyEnabled: dto.auto_reply_enabled ?? true,
        confidenceThreshold: dto.confidence_threshold ?? 0.75,
        escalationKeywords: dto.escalation_keywords ?? ['refund', 'komplain', 'marah', 'tipu'],
        fallbackMessage: dto.fallback_message ?? 'Terima kasih, pesanmu sudah kami terima. Tim kami akan membalas segera.',
      },
    });
    return this.formatSettings(settings);
  }

  // ── Knowledge Base ────────────────────────────────────────────

  async listKb(slug: string) {
    const platform = await this.requirePlatform(slug);
    const items = await this.prisma.helpdeskKnowledgeBase.findMany({
      where: { platformId: platform.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return { platform: slug, total: items.length, data: items.map(this.formatKb) };
  }

  async searchKb(slug: string, q: string) {
    const platform = await this.requirePlatform(slug);
    const lower = q.toLowerCase();
    const items = await this.prisma.helpdeskKnowledgeBase.findMany({
      where: {
        platformId: platform.id,
        isActive: true,
        OR: [
          { question: { contains: lower, mode: 'insensitive' } },
          { answer: { contains: lower, mode: 'insensitive' } },
          { tags: { has: lower } },
        ],
      },
      take: 5,
    });

    // Skor sederhana berdasarkan berapa banyak kata query yang cocok
    const queryWords = lower.split(/\s+/);
    const scored = items.map((item) => {
      const text = `${item.question} ${item.answer}`.toLowerCase();
      const hits = queryWords.filter((w) => text.includes(w)).length;
      const score = Math.min(hits / queryWords.length, 1);
      return { id: item.id, question: item.question, answer: item.answer, score: parseFloat(score.toFixed(2)) };
    });

    return { query: q, results: scored.sort((a, b) => b.score - a.score) };
  }

  async createKb(slug: string, dto: CreateKbDto) {
    const platform = await this.requirePlatform(slug);
    const item = await this.prisma.helpdeskKnowledgeBase.create({
      data: {
        platformId: platform.id,
        category: dto.category ?? null,
        question: dto.question,
        answer: dto.answer,
        tags: dto.tags ?? [],
      },
    });
    return this.formatKb(item);
  }

  async updateKb(slug: string, id: string, dto: UpdateKbDto) {
    await this.requirePlatform(slug);
    const existing = await this.prisma.helpdeskKnowledgeBase.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`KB item '${id}' tidak ditemukan`);
    const item = await this.prisma.helpdeskKnowledgeBase.update({
      where: { id },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.question && { question: dto.question }),
        ...(dto.answer && { answer: dto.answer }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.is_active !== undefined && { isActive: dto.is_active }),
      },
    });
    return this.formatKb(item);
  }

  async deleteKb(slug: string, id: string) {
    await this.requirePlatform(slug);
    await this.prisma.helpdeskKnowledgeBase.update({ where: { id }, data: { isActive: false } });
    return { deleted: true, id };
  }

  // ── Conversations ─────────────────────────────────────────────

  async listConversations(slug: string, status?: string) {
    const platform = await this.requirePlatform(slug);
    const convs = await this.prisma.helpdeskConversation.findMany({
      where: { platformId: platform.id, ...(status && { status }) },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });
    return { platform: slug, data: convs.map((c) => ({
      id: c.id, channel_type: c.channelType, customer: c.customerName ?? c.customerIdentifier,
      status: c.status, message_count: c._count.messages, last_message_at: c.lastMessageAt.toISOString(),
    })) };
  }

  async getConversation(slug: string, id: string) {
    await this.requirePlatform(slug);
    const conv = await this.prisma.helpdeskConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } }, escalations: true },
    });
    if (!conv) throw new NotFoundException(`Conversation '${id}' tidak ditemukan`);
    return {
      id: conv.id, channel_type: conv.channelType, customer_identifier: conv.customerIdentifier,
      customer_name: conv.customerName, status: conv.status, assigned_agent: conv.assignedAgent,
      created_at: conv.createdAt.toISOString(), last_message_at: conv.lastMessageAt.toISOString(),
      messages: conv.messages.map((m) => ({
        id: m.id, sender_type: m.senderType, message_text: m.messageText,
        ai_confidence_score: m.aiConfidenceScore ? Number(m.aiConfidenceScore) : null,
        created_at: m.createdAt.toISOString(),
      })),
      escalations: conv.escalations,
    };
  }

  // ── Messages (dipanggil n8n) ──────────────────────────────────

  async inboundMessage(dto: InboundMessageDto) {
    const platform = await this.requirePlatform(dto.platform);

    // Cari atau buat conversation berdasarkan customer_identifier + channel
    let conv = await this.prisma.helpdeskConversation.findFirst({
      where: {
        platformId: platform.id,
        channelType: dto.channel,
        customerIdentifier: dto.customer_identifier,
        status: { in: ['open', 'escalated'] },
      },
    });

    const isNew = !conv;
    if (!conv) {
      conv = await this.prisma.helpdeskConversation.create({
        data: {
          platformId: platform.id,
          channelType: dto.channel,
          customerIdentifier: dto.customer_identifier,
          customerName: dto.customer_name ?? null,
          status: 'open',
        },
      });
    } else {
      await this.prisma.helpdeskConversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: new Date() },
      });
    }

    await this.prisma.helpdeskMessage.create({
      data: { conversationId: conv.id, senderType: 'customer', messageText: dto.message_text },
    });

    return { conversation_id: conv.id, is_new_conversation: isNew, status: conv.status };
  }

  async outboundMessage(dto: OutboundMessageDto) {
    const conv = await this.prisma.helpdeskConversation.findUnique({ where: { id: dto.conversation_id } });
    if (!conv) throw new NotFoundException(`Conversation '${dto.conversation_id}' tidak ditemukan`);

    const msg = await this.prisma.helpdeskMessage.create({
      data: {
        conversationId: dto.conversation_id,
        senderType: dto.sender_type,
        messageText: dto.message_text,
        aiConfidenceScore: dto.ai_confidence_score ?? null,
        matchedKbId: dto.matched_kb_id ?? null,
      },
    });

    await this.prisma.helpdeskConversation.update({
      where: { id: dto.conversation_id },
      data: { lastMessageAt: new Date() },
    });

    return { message_id: msg.id, conversation_id: dto.conversation_id, recorded: true };
  }

  async escalateConversation(id: string, dto: EscalateDto) {
    const conv = await this.prisma.helpdeskConversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException(`Conversation '${id}' tidak ditemukan`);

    await Promise.all([
      this.prisma.helpdeskConversation.update({ where: { id }, data: { status: 'escalated' } }),
      this.prisma.helpdeskEscalation.create({
        data: { conversationId: id, reason: dto.reason },
      }),
    ]);

    return { conversation_id: id, status: 'escalated', reason: dto.reason };
  }

  async closeConversation(id: string) {
    const conv = await this.prisma.helpdeskConversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException(`Conversation '${id}' tidak ditemukan`);
    await this.prisma.helpdeskConversation.update({ where: { id }, data: { status: 'closed' } });
    return { conversation_id: id, status: 'closed' };
  }

  // ── private helpers ───────────────────────────────────────────

  private async requirePlatform(slug: string) {
    const p = await this.prisma.platform.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException(`Platform '${slug}' tidak ditemukan`);
    return p;
  }

  private formatSettings(s: { autoReplyEnabled: boolean; confidenceThreshold: unknown; escalationKeywords: string[]; fallbackMessage: string; updatedAt: Date }) {
    return {
      auto_reply_enabled: s.autoReplyEnabled,
      confidence_threshold: Number(s.confidenceThreshold),
      escalation_keywords: s.escalationKeywords,
      fallback_message: s.fallbackMessage,
      updated_at: s.updatedAt.toISOString(),
    };
  }

  private formatKb(item: { id: string; category: string | null; question: string; answer: string; tags: string[]; isActive: boolean; createdAt: Date }) {
    return {
      id: item.id, category: item.category, question: item.question,
      answer: item.answer, tags: item.tags, is_active: item.isActive,
      created_at: item.createdAt.toISOString(),
    };
  }
}
