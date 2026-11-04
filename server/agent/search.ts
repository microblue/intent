import type { ChatProvider } from './provider';

export interface SearchResult {
  text: string;
  sources: { title: string; url: string }[];
  costMicros: number;
}

export interface SearchProvider {
  readonly id: string;
  search(query: string): Promise<SearchResult>;
}

/**
 * Web search through a model call that has the platform's web plugin turned on
 * (OpenRouter `plugins: [{ id: 'web' }]`). Returns a factual digest with links.
 */
export class PluginWebSearch implements SearchProvider {
  readonly id = 'openrouter-web';
  constructor(
    private readonly chat: ChatProvider,
    private readonly model: string,
  ) {}

  async search(query: string): Promise<SearchResult> {
    const r = await this.chat.complete({
      model: this.model,
      maxTokens: 4096,
      extra: { plugins: [{ id: 'web', max_results: 5 }] },
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Search the web and report concrete facts that answer the query: names, prices with currency, stores, dates, addresses, ratings, return policies, and the page URL for each fact. Be concise, no advice. If the results do not answer the query, say so.',
        },
        { role: 'user', content: query },
      ],
    });
    return { text: r.text ?? '', sources: r.citations.slice(0, 8), costMicros: r.costMicros };
  }
}

/** Never invent live search results when no search backend is configured. */
export class DisabledSearch implements SearchProvider {
  readonly id = 'unavailable';
  async search(): Promise<SearchResult> {
    throw new Error('Live search is not configured');
  }
}

/** Meta's built-in web search is available on Responses, not Chat Completions. */
export class MetaWebSearch implements SearchProvider {
  readonly id = 'meta-web';
  constructor(private readonly key: string, private readonly model: string) {}
  async search(query: string): Promise<SearchResult> {
    const response = await fetch('https://api.meta.ai/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(45_000),
      headers: { Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: 'Search the live web, answer concisely and cite sources: ' + query,
        tools: [{ type: 'web_search', search_context_size: 'low' }], reasoning: { effort: 'low' }, max_output_tokens: 4096 }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Meta search failed: ' + response.status); }
    const data = await response.json() as { output?: { type: string; content?: { type: string; text?: string; annotations?: { type: string; url: string; title?: string }[] }[] }[] };
    const output = data.output ?? [];
    const blocks = output.filter(item => item.type === 'message').flatMap(item => item.content ?? []).filter(block => block.type === 'output_text');
    const sources = blocks.flatMap(block => block.annotations ?? []).filter(a => a.type === 'url_citation' && /^https?:\/\//.test(a.url)).map(a => ({ title: a.title ?? a.url, url: a.url }));
    if (!output.some(item => item.type === 'web_search_call') || !sources.length) throw new Error('No grounded web results returned');
    return { text: blocks.map(block => block.text ?? '').join('\n'), sources: sources.slice(0, 8), costMicros: 0 };
  }
}
