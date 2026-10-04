import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { PrismaService } from '../../prisma/prisma.service';
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
  /** Label pencatatan biaya AI: fitur mana yang memakai token ini. */
  usageTag?: UsageTag;
}

export interface UsageTag {
  /** mis. 'virtual_office', 'nightly_report', 'content_caption' */
  feature: string;
  executiveRole?: string;
  sessionId?: string;
}

/**
 * Penghitung token untuk satu rangkaian request ke SATU model.
 *
 * Output Gemini dihitung sebagai total − prompt, bukan candidatesTokenCount:
 * model 2.5 memakai token "berpikir" yang ditagih sebagai output tapi tidak
 * masuk candidatesTokenCount (dan tidak diketik di SDK 0.24). Tanpa ini biaya
 * Gemini tampak lebih murah dari kenyataan dan perbandingan provider berat
 * sebelah.
 */
class UsageMeter {
  requests = 0;
  input = 0;
  output = 0;
  thinking = 0;
  cached = 0;

  addGemini(u?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number; cachedContentTokenCount?: number }) {
    this.requests += 1;
    if (!u) return;
    const prompt = u.promptTokenCount ?? 0;
    const candidates = u.candidatesTokenCount ?? 0;
    const total = u.totalTokenCount ?? prompt + candidates;
    this.input += prompt;
    this.output += Math.max(candidates, total - prompt);
    this.thinking += Math.max(0, total - prompt - candidates);
    this.cached += u.cachedContentTokenCount ?? 0;
  }

  addAnthropic(u?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
    this.requests += 1;
    if (!u) return;
    this.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    this.output += u.output_tokens ?? 0;
    this.cached += u.cache_read_input_tokens ?? 0;
  }
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private anthropic?: Anthropic;
  private gemini?: GoogleGenerativeAI;

  constructor(private readonly prisma: PrismaService) {
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
    usageTag: UsageTag = { feature: 'chat' },
  ): Promise<string> {
    const provider = this.activeProvider;
    try {
      if (provider === 'gemini') return await this.chatGemini(systemPrompt, history, userMessage, preferredModel, usageTag);
      if (provider === 'anthropic') return await this.chatAnthropic(systemPrompt, history, userMessage, preferredModel, usageTag);
    } catch (err) {
      throw this.providerFailure(err);
    }
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
    if (provider === 'anthropic') {
      try {
        return await this.runAgentAnthropic(opts);
      } catch (err) {
        throw this.providerFailure(err);
      }
    }

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
    preferredModel: string | undefined,
    usageTag: UsageTag,
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

    const meter = new UsageMeter();
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    meter.addGemini(result.response.usageMetadata);
    await this.recordUsage('gemini', modelName, usageTag, meter, true);
    return result.response.text();
  }

  // ── Anthropic ─────────────────────────────────────────────────

  private async chatAnthropic(
    systemPrompt: string,
    history: AIChatMessage[],
    userMessage: string,
    preferredModel: string | undefined,
    usageTag: UsageTag,
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
    const meter = new UsageMeter();
    meter.addAnthropic(response.usage);
    await this.recordUsage('anthropic', modelName, usageTag, meter, true);
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  // ── Agentic loop: Gemini function calling ─────────────────────

  /**
   * Jalankan agent Gemini dengan rantai model cadangan.
   *
   * Terbukti di produksi: tiap 07:00 WIB (00:00 UTC) gemini-2.5-flash membalas
   * 503 "model is currently experiencing high demand" tujuh hari berturut-turut,
   * sehingga semua briefing pagi gagal. Kalau model utama sesak, pindah ke
   * model berikutnya alih-alih menyerah.
   *
   * Pindah model HANYA dilakukan kalau belum ada tool yang sempat dijalankan.
   * Kalau kegagalan terjadi di tengah loop, mengulang dari awal berarti tool
   * tulis (mis. create_alert) bisa tereksekusi dua kali — lebih baik gagal jujur.
   */
  private async runAgentGemini(opts: AgentRunOptions): Promise<AgentRunResult> {
    const models = this.geminiModelChain(opts.preferredModel);
    let lastError: unknown;

    for (const [index, modelName] of models.entries()) {
      const trace: AgentToolTrace[] = [];
      const meter = new UsageMeter();
      try {
        const result = await this.runAgentGeminiWithModel(opts, modelName, trace, meter);
        await this.recordUsage('gemini', modelName, opts.usageTag, meter, true);
        if (index > 0) {
          this.logger.warn(`Agent memakai model cadangan '${modelName}' karena model utama sesak`);
        }
        return result;
      } catch (err) {
        // Token yang sudah terpakai sebelum gagal tetap ditagih provider.
        await this.recordUsage('gemini', modelName, opts.usageTag, meter, false);
        lastError = err;
        const canFallBack = this.isTransient(err) && trace.length === 0;
        if (!canFallBack || index === models.length - 1) break;
        this.logger.warn(
          `Model '${modelName}' gagal (${this.statusOf(err)}), coba model cadangan '${models[index + 1]}'`,
        );
      }
    }

    throw this.providerFailure(lastError);
  }

  private async runAgentGeminiWithModel(
    opts: AgentRunOptions,
    modelName: string,
    trace: AgentToolTrace[],
    meter: UsageMeter,
  ): Promise<AgentRunResult> {
    const maxIterations = opts.maxIterations ?? 6;

    const model = this.gemini!.getGenerativeModel({
      model: modelName,
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
    meter.addGemini(result.response.usageMetadata);
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
      meter.addGemini(result.response.usageMetadata);
    }

    return {
      text: this.safeGeminiText(result.response),
      tool_calls: trace,
      iterations,
      provider: `gemini:${modelName}`,
    };
  }

  /**
   * Model utama + cadangan. Cadangan memakai alias `-latest` karena nama versi
   * spesifik bisa pensiun diam-diam — terbukti gemini-2.0-flash sudah 404.
   * Bisa diganti tanpa deploy lewat env GEMINI_FALLBACK_MODELS (pisah koma).
   */
  private geminiModelChain(preferred?: string): string[] {
    const primary = this.resolveGeminiModel(preferred);
    const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-flash-latest,gemini-flash-lite-latest')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    return [primary, ...fallbacks.filter((m) => m !== primary)];
  }

  // ── Agentic loop: Anthropic tool use ──────────────────────────

  private async runAgentAnthropic(opts: AgentRunOptions): Promise<AgentRunResult> {
    const meter = new UsageMeter();
    const modelName = this.resolveAnthropicModel(opts.preferredModel);
    try {
      const result = await this.runAgentAnthropicLoop(opts, modelName, meter);
      await this.recordUsage('anthropic', modelName, opts.usageTag, meter, true);
      return result;
    } catch (err) {
      await this.recordUsage('anthropic', modelName, opts.usageTag, meter, false);
      throw err;
    }
  }

  private async runAgentAnthropicLoop(
    opts: AgentRunOptions,
    modelName: string,
    meter: UsageMeter,
  ): Promise<AgentRunResult> {
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
          model: modelName,
          max_tokens: 2048,
          system: opts.systemPrompt,
          messages,
          tools,
        }),
      );

      meter.addAnthropic(response.usage);

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
  /**
   * Ulangi panggilan provider saat gangguannya sementara. Error ASLI provider
   * dilempar ulang apa adanya (tidak dibungkus) supaya pemanggil masih bisa
   * memutuskan pindah ke model cadangan berdasarkan status-nya.
   */
  private async withQuotaRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        if (!this.isTransient(err) || attempt >= maxAttempts) throw err;
        const waitMs = this.retryDelayMs(err);
        this.logger.warn(
          `Provider AI sedang ${this.statusOf(err) === 429 ? 'membatasi kuota' : 'sesak'} (${this.statusOf(err)}), tunggu ${Math.round(waitMs / 1000)} dtk (percobaan ${attempt}/${maxAttempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  /**
   * Gangguan yang layak diulang. 503 WAJIB masuk — versi lama hanya mengenali
   * 429, sehingga 503 "high demand" langsung dianggap gagal permanen dan
   * membunuh 28 briefing pagi berturut-turut.
   */
  private isTransient(err: unknown): boolean {
    const status = this.statusOf(err);
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  private statusOf(err: unknown): number | undefined {
    return (err as { status?: number })?.status;
  }

  /** Ubah error provider jadi pesan 503 yang bisa dibaca kapten, sesuai sebabnya. */
  private providerFailure(err: unknown): Error {
    const status = this.statusOf(err);
    // 402 = billing, bukan gangguan. Terjadi 4 Okt 2026: project Gemini masuk
    // mode prabayar dengan saldo nol, semua model membalas 402. Tidak diulang
    // dan tidak pindah model — model lain di project yang sama pasti 402 juga.
    if (status === 402) {
      return new ServiceUnavailableException(
        `Saldo AI provider (${this.activeProvider}) habis. Untuk Gemini: buka aistudio.google.com → project NineOS → Billing, lalu isi saldo prabayar. NineOS langsung normal kembali tanpa perlu deploy.`,
      );
    }
    if (status === 429) {
      return new ServiceUnavailableException(
        `Kuota AI provider (${this.activeProvider}) habis untuk hari ini. Gemini free tier dibatasi 20 request per hari. Isi ANTHROPIC_API_KEY atau aktifkan billing Google untuk menghilangkannya.`,
      );
    }
    if (this.isTransient(err)) {
      return new ServiceUnavailableException(
        `Semua model AI (${this.activeProvider}) sedang sesak dan sudah dicoba berulang. Ini gangguan sementara di sisi provider — coba lagi beberapa menit lagi.`,
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  /** Provider mengirim `retryDelay: '42s'` — hormati, tapi jangan sampai request menggantung terlalu lama. */
  private retryDelayMs(err: unknown): number {
    const details = (err as { errorDetails?: Array<{ retryDelay?: string }> })?.errorDetails ?? [];
    const raw = details.find((d) => d.retryDelay)?.retryDelay;
    const seconds = raw ? parseInt(raw.replace(/[^0-9]/g, ''), 10) : NaN;
    const resolved = Number.isFinite(seconds) ? seconds * 1000 : 15_000;
    return Math.min(Math.max(resolved, 2_000), 45_000);
  }

  /**
   * Simpan pemakaian token. TIDAK PERNAH melempar — gagal mencatat biaya tidak
   * boleh menggagalkan jawaban AI. Dilewati kalau tidak ada request yang
   * sampai ke provider (mis. langsung ditolak 503), karena tidak ada yang ditagih.
   */
  private async recordUsage(provider: string, model: string, tag: UsageTag | undefined, meter: UsageMeter, succeeded: boolean) {
    if (meter.requests === 0) return;
    try {
      await this.prisma.aiUsage.create({
        data: {
          provider,
          model,
          feature: (tag?.feature ?? 'unknown').slice(0, 40),
          executiveRole: tag?.executiveRole ?? null,
          sessionId: tag?.sessionId ?? null,
          requests: meter.requests,
          inputTokens: meter.input,
          outputTokens: meter.output,
          thinkingTokens: meter.thinking,
          cachedTokens: meter.cached,
          succeeded,
        },
      });
    } catch (err) {
      this.logger.warn(`Gagal mencatat pemakaian AI: ${err instanceof Error ? err.message : err}`);
    }
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
