import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import {
  AgentRunResult,
  AgentToolDefinition,
  AgentToolTrace,
  ToolDispatcher,
} from '../agent/agent.types';

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentRunOptions {
  systemPrompt: string;
  history: AIChatMessage[];
  userMessage: string;
  tools: AgentToolDefinition[];
  dispatch: ToolDispatcher;
  preferredModel?: string;
  /** Batas putaran tool-call sebelum dipaksa menjawab. Default 6. */
  maxIterations?: number;
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

  /**
   * Jalankan AI dalam mode AGENTIC: model boleh memanggil tool berkali-kali
   * untuk mengambil/mengubah data sebelum menyusun jawaban akhir.
   *
   * Loop berhenti saat model tidak lagi meminta tool, atau saat `maxIterations`
   * tercapai (jawaban terakhir tetap dikembalikan apa adanya).
   */
  async runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
    const provider = this.activeProvider;

    if (provider === 'gemini') return this.runAgentGemini(opts);
    if (provider === 'anthropic') return this.runAgentAnthropic(opts);

    return {
      text: this.noKeyMessage(),
      tool_calls: [],
      iterations: 0,
      provider: 'none',
    };
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

  // ── Agentic loop: Gemini function calling ─────────────────────

  private async runAgentGemini(opts: AgentRunOptions): Promise<AgentRunResult> {
    const maxIterations = opts.maxIterations ?? 6;
    const trace: AgentToolTrace[] = [];

    const model = this.gemini!.getGenerativeModel({
      model: this.resolveGeminiModel(opts.preferredModel),
      systemInstruction: opts.systemPrompt,
      tools: [
        {
          functionDeclarations: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            // Gemini menolak OBJECT dengan properties kosong — kirim undefined.
            ...(Object.keys(t.parameters.properties).length > 0
              ? { parameters: t.parameters as never }
              : {}),
          })),
        },
      ],
    });

    const chat = model.startChat({
      history: this.sanitizeHistory(opts.history).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    let result = await this.withQuotaRetry(() => chat.sendMessage(opts.userMessage));
    let iterations = 0;

    while (iterations < maxIterations) {
      const calls = result.response.functionCalls();
      if (!calls || calls.length === 0) break;

      iterations += 1;
      const parts: Part[] = [];

      for (const call of calls) {
        const outcome = await this.dispatchTraced(
          opts.dispatch,
          call.name,
          (call.args ?? {}) as Record<string, unknown>,
          trace,
        );
        parts.push({
          functionResponse: {
            name: call.name,
            // Gemini mewajibkan `response` berupa object, bukan array/primitif.
            response: outcome.ok
              ? { result: outcome.data }
              : { error: outcome.data },
          },
        });
      }

      result = await this.withQuotaRetry(() => chat.sendMessage(parts));
    }

    return {
      text: this.safeGeminiText(result.response),
      tool_calls: trace,
      iterations,
      provider: 'gemini',
    };
  }

  // ── Agentic loop: Anthropic tool use ──────────────────────────

  private async runAgentAnthropic(opts: AgentRunOptions): Promise<AgentRunResult> {
    const maxIterations = opts.maxIterations ?? 6;
    const trace: AgentToolTrace[] = [];

    const messages: Anthropic.MessageParam[] = [
      ...this.sanitizeHistory(opts.history).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user' as const, content: opts.userMessage },
    ];

    const tools: Anthropic.Tool[] = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));

    let iterations = 0;
    let text = '';

    while (iterations <= maxIterations) {
      const response = await this.withQuotaRetry(() =>
        this.anthropic!.messages.create({
          model: this.resolveAnthropicModel(opts.preferredModel),
          max_tokens: 2048,
          system: opts.systemPrompt,
          messages,
          tools,
        }),
      );

      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) break;

      iterations += 1;
      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const outcome = await this.dispatchTraced(
          opts.dispatch,
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          trace,
        );
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(outcome.data),
          is_error: !outcome.ok,
        });
      }
      messages.push({ role: 'user', content: results });
    }

    return { text, tool_calls: trace, iterations, provider: 'anthropic' };
  }

  // ── helpers ───────────────────────────────────────────────────

  /**
   * Satu giliran agentic = beberapa request ke provider (1 awal + 1 per putaran
   * tool). Gemini free tier cuma 5 request/menit, jadi 429 itu wajar, bukan
   * kegagalan permanen — tunggu sesuai `retryDelay` yang dikirim provider lalu
   * ulangi. Kalau kuota tetap habis, lempar 503 dengan pesan yang bisa dibaca
   * kapten, bukan "Internal server error".
   */
  private async withQuotaRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        if (!this.isRateLimit(err) || attempt >= maxAttempts) {
          if (this.isRateLimit(err)) {
            throw new ServiceUnavailableException(
              `Kuota AI provider (${this.activeProvider}) habis. Gemini free tier dibatasi 5 request/menit, sementara satu giliran agentic butuh beberapa request. Tunggu sebentar, aktifkan billing Google, atau isi ANTHROPIC_API_KEY sebagai fallback.`,
            );
          }
          throw err;
        }
        const waitMs = this.retryDelayMs(err);
        this.logger.warn(
          `Kena rate limit provider, tunggu ${Math.round(waitMs / 1000)} dtk (percobaan ${attempt}/${maxAttempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  private isRateLimit(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    return status === 429;
  }

  /** Provider mengirim `retryDelay: '42s'` — hormati, tapi jangan sampai request menggantung terlalu lama. */
  private retryDelayMs(err: unknown): number {
    const details = (err as { errorDetails?: Array<{ retryDelay?: string }> })?.errorDetails ?? [];
    const raw = details.find((d) => d.retryDelay)?.retryDelay;
    const seconds = raw ? parseInt(raw.replace(/[^0-9]/g, ''), 10) : NaN;
    const resolved = Number.isFinite(seconds) ? seconds * 1000 : 15_000;
    return Math.min(Math.max(resolved, 2_000), 45_000);
  }

  /** Jalankan satu tool, catat hasil + durasi ke trace, jangan pernah throw. */
  private async dispatchTraced(
    dispatch: ToolDispatcher,
    name: string,
    args: Record<string, unknown>,
    trace: AgentToolTrace[],
  ) {
    const startedAt = Date.now();
    try {
      const outcome = await dispatch({ name, args });
      trace.push({
        name,
        args,
        ok: outcome.ok,
        status: outcome.ok ? 'ok' : 'error',
        duration_ms: Date.now() - startedAt,
      });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool '${name}' gagal: ${message}`);
      trace.push({
        name,
        args,
        ok: false,
        status: 'exception',
        duration_ms: Date.now() - startedAt,
      });
      return { ok: false, data: { error: message } };
    }
  }

  /**
   * Gemini & Anthropic dua-duanya menolak riwayat yang tidak diawali 'user'
   * atau punya dua giliran berturut-turut dengan peran sama. Rapikan dulu.
   */
  private sanitizeHistory(history: AIChatMessage[]): AIChatMessage[] {
    const trimmed = [...history];
    while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();

    const merged: AIChatMessage[] = [];
    for (const msg of trimmed) {
      const prev = merged[merged.length - 1];
      if (prev && prev.role === msg.role) {
        prev.content = `${prev.content}\n\n${msg.content}`;
      } else {
        merged.push({ ...msg });
      }
    }
    // Riwayat harus berakhir di 'assistant' supaya pesan user berikutnya valid.
    if (merged.length && merged[merged.length - 1].role === 'user') merged.pop();
    return merged;
  }

  /** `response.text()` melempar kalau balasan terakhir cuma function call. */
  private safeGeminiText(response: { text: () => string }): string {
    try {
      return response.text().trim();
    } catch {
      return 'Saya sudah mengambil datanya tapi belum sempat menyimpulkan — coba tanya sekali lagi.';
    }
  }


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
