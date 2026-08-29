// Kontrak tool agentic NineOS.
//
// Skema parameter sengaja dibatasi ke subset JSON Schema yang diterima
// DUA provider sekaligus (Gemini `FunctionDeclaration.parameters` yang
// mengikuti OpenAPI 3.0, dan Anthropic `tool.input_schema`). Jangan pakai
// keyword di luar daftar ini (oneOf, $ref, additionalProperties, dll) —
// Gemini akan menolak deklarasinya.

export type ToolRisk = 'read' | 'write' | 'sensitive';

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description: string;
  enum?: string[];
  items?: { type: 'string' | 'number' };
}

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  /**
   * read      → eksekusi langsung, tidak mengubah apa pun
   * write     → mengubah data internal NineOS, eksekusi langsung, tercatat di audit
   * sensitive → menyentuh dunia luar / keputusan berdampak, WAJIB approval kapten
   */
  risk: ToolRisk;
  parameters: JsonSchemaObject;
}

export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolOutcome {
  ok: boolean;
  /** Payload yang dikirim balik ke model. Selalu JSON-serializable. */
  data: unknown;
}

export type ToolDispatcher = (call: ToolInvocation) => Promise<ToolOutcome>;

export interface AgentToolTrace {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  status: string;
  duration_ms: number;
}

export interface AgentRunResult {
  text: string;
  tool_calls: AgentToolTrace[];
  iterations: number;
  provider: string;
}

/** Konteks eksekusi — dipakai untuk audit trail siapa yang memanggil. */
export interface AgentExecutionContext {
  sessionId?: string;
  executiveRole?: string;
  /** Sumber pemanggil: 'virtual_office' | 'watcher' | 'manual' */
  origin: string;
}
