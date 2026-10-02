import { afterEach, describe, it, expect, vi } from 'vitest';
import { generate } from '../worker/providers';
import type { Env } from '../worker/env';
import type { Span } from '../core/types';
afterEach(() => vi.unstubAllGlobals());
describe('provider routing', () => {
  it('reads a local Ollama answer with thinking disabled and a bounded deadline', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        message: { content: '{"answer":"30 gün [S1]","citations":["S1"],"abstained":false}' },
        prompt_eval_count: 200,
        eval_count: 25,
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await generate(
      {
        ENVIRONMENT: 'development',
        MODEL_ROUTE: 'local-first',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        LOCAL_MODEL: 'gemma4:12b-mlx',
      } as Env,
      'İade süresi?',
      [{ id: 'S1', text: '30 gün', title: 'Policy' }],
      [],
    );
    expect(result.result?.provider).toBe('ollama');
    expect(result.result?.outputTokens).toBe(25);
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).think).toBe(false);
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('reads the Gemma 4 OpenAI-shaped Workers AI response', async () => {
    const run = vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content: '{"answer":"30 days [S1]","citations":["S1"],"abstained":false}' },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 25 },
    });
    const result = await generate(
      { AI: { run } } as unknown as Env,
      'Return window?',
      [{ id: 'S1', text: '30 days', title: 'Policy' }],
      [],
    );
    expect(result.result?.provider).toBe('workers-ai');
    expect(result.result?.inputTokens).toBe(120);
    expect(run.mock.calls[0][1].chat_template_kwargs.enable_thinking).toBe(false);
  });
  it('falls back on an invalid Cloudflare response and enforces paid-provider ceilings', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: { content: '{"answer":"30 gün [S1]","citations":["S1"],"abstained":false}' },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 20, cost: 0.0001 },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ response: 'invalid' }) },
      OPENROUTER_API_KEY: 'test',
      OPENROUTER_MODEL: 'google/gemma-4-26b-a4b-it',
      SITE_URL: 'https://example.com',
    } as unknown as Env;
    const spans: Span[] = [];
    const result = await generate(
      env,
      'İade süresi?',
      [{ id: 'S1', text: '30 gün', title: 'Policy' }],
      spans,
    );
    expect(result.result?.provider).toBe('openrouter');
    expect(result.reason).toContain('invalid_citations');
    expect(spans.map((s) => s.status)).toEqual(['error', 'ok']);
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.provider.max_price).toEqual({ prompt: 0.25, completion: 1 });
    expect(payload.max_tokens).toBe(1024);
  });
  it('does not route production traffic to a local endpoint', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const result = await generate(
      {
        ENVIRONMENT: 'production',
        MODEL_ROUTE: 'local-first',
        OLLAMA_BASE_URL: 'http://localhost:11434',
      } as Env,
      'q',
      [],
      [],
    );
    expect(result.result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns evidence fallback when no provider is configured', async () => {
    expect((await generate({} as Env, 'q', [], [])).reason).toBe('inference_not_configured');
  });
  it('refuses an oversized context before making a billable call', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const result = await generate(
      { OPENROUTER_API_KEY: 'test' } as Env,
      'q',
      [{ id: 'S1', text: 'x'.repeat(25000), title: 'x' }],
      [],
    );
    expect(result.reason).toBe('context_budget');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
