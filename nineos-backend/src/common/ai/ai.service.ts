import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private anthropic?: Anthropic;
  private gemini?: GoogleGenerativeAI;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  /**
   * Panggil AI dengan provider yang tersedia.
   * Prioritas: AI_PROVIDER env → fallback otomatis ke provider yang punya key.
   * Model default: gemini-2.5-flash (Gemini) atau claude-sonnet-4-6 (Anthropic).
   */
  async chat(
    systemPrompt: string,
    history: AIChatMessage[],
    userMessage: string,
    preferredModel?: string,
  ): Promise<string> {
    const provider = (process.env.AI_PROVIDER ?? this.detectProvider()).toLowerCase();

    if (provider === 'gemini' && this.gemini) {
      return this.chatGemini(systemPrompt, history, userMessage, preferredModel);
    }

    if (provider === 'anthropic' && this.anthropic) {
      return this.chatAnthropic(systemPrompt, history, userMessage, preferredModel);
    }

    // Fallback jika provider tidak cocok dengan key yang ada
    if (this.gemini) return this.chatGemini(systemPrompt, history, userMessage, preferredModel);
    if (this.anthropic) return this.chatAnthropic(systemPrompt, history, userMessage, preferredModel);

    return this.noKeyMessage();
  }

  get activeProvider(): string {
    const provider = (process.env.AI_PROVIDER ?? this.detectProvider()).toLowerCase();
    if (provider === 'gemini' && this.gemini) return 'gemini';
    if (provider === 'anthropic' && this.anthropic) return 'anthropic';
    if (this.gemini) return 'gemini';
    if (this.anthropic) return 'anthropic';
    return 'none';
  }

  // ── Gemini ────────────────────────────────────────────────────

  private async chatGemini(
    systemPrompt: string,
    history: AIChatMessage[],
    userMessage: string,
    preferredModel?: string,
  ): Promise<string> {
    const modelName = this.resolveGeminiModel(preferredModel);
    const model = this.gemini!.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });

    const geminiHistory = history.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  }

  // ── Anthropic ─────────────────────────────────────────────────

  private async chatAnthropic(
    systemPrompt: string,
    history: AIChatMessage[],
    userMessage: string,
    preferredModel?: string,
  ): Promise<string> {
    const modelName = this.resolveAnthropicModel(preferredModel);
    const messages = [...history];
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: userMessage });
    }

    const response = await this.anthropic!.messages.create({
      model: modelName,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  // ── helpers ───────────────────────────────────────────────────

  private detectProvider(): string {
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    return 'none';
  }

  private resolveGeminiModel(preferred?: string): string {
    if (!preferred || preferred.startsWith('claude-')) return 'gemini-2.5-flash';
    return preferred;
  }

  private resolveAnthropicModel(preferred?: string): string {
    if (!preferred || preferred.startsWith('gemini-')) return 'claude-sonnet-4-6';
    return preferred;
  }

  private noKeyMessage(): string {
    return [
      'Virtual Office belum aktif. Tambahkan salah satu ke .env:',
      '  GEMINI_API_KEY=AIza...   (Google AI Studio → gratis)',
      '  ANTHROPIC_API_KEY=sk-ant-...   (console.anthropic.com)',
      'Lalu set: AI_PROVIDER=gemini  atau  AI_PROVIDER=anthropic',
    ].join('\n');
  }
}
