/**
 * Model platform adapters. Business code depends only on ChatProvider, so a
 * platform is swapped by adding an adapter, never by touching the agent loop.
 *
 * The common denominator we target is "chat completions with tool calls",
 * which OpenRouter, OpenAI, DeepSeek, Gemini (OpenAI-compatible endpoint),
 * Ollama and others all speak. A native Anthropic / Managed Agents adapter
 * can implement the same interface later.
 */

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallWire[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolCallWire {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  /** Provider-specific extras, e.g. OpenRouter plugins. */
  extra?: Record<string, unknown>;
}

export interface ChatResult {
  text: string | null;
  toolCalls: ToolCallWire[];
  costMicros: number;
  /** Raw annotations (citations) when the platform returns them. */
  citations: { title: string; url: string }[];
}

export interface ChatProvider {
  readonly id: string;
  complete(req: ChatRequest): Promise<ChatResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Any OpenAI-compatible endpoint (OpenRouter by default). */
export class OpenAICompatProvider implements ChatProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  async complete(req: ChatRequest): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 4096,
      ...(this.id === 'openrouter' ? { reasoning: { effort: 'low' } } : this.id === 'meta' ? { reasoning_effort: 'low' } : {}),
      ...req.extra,
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: t }));
    }
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(45_000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    if (!res!.ok) {
      await res!.body?.cancel();
      throw new ProviderError(`model call failed ${res!.status}`, res!.status === 429 || res!.status >= 500);
    }
    const data = (await res!.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: ToolCallWire[];
          annotations?: { type: string; url_citation?: { url: string; title?: string } }[];
        };
      }[];
      usage?: { cost?: number };
      error?: { message?: string };
    };
    const msg = data.choices?.[0]?.message;
    if (!msg || (!msg.content?.trim() && !msg.tool_calls?.length)) throw new ProviderError(data.error?.message ?? 'empty model response', true);
    return {
      text: msg.content ?? null,
      toolCalls: (msg.tool_calls ?? []).map((c) => ({ ...c, type: 'function' as const })),
      costMicros: Math.round((data.usage?.cost ?? 0) * 1_000_000),
      citations: (msg.annotations ?? [])
        .filter((a) => a.url_citation?.url)
        .map((a) => ({ url: a.url_citation!.url, title: a.url_citation!.title ?? a.url_citation!.url })),
    };
  }
}
