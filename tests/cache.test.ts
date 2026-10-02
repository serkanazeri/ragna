import { describe, it, expect } from 'vitest';
import { CACHE_TTL_MS, cacheKey, validateCacheEntry } from '../worker/answer-cache';
import { chunkDocuments } from '../core/retrieval';
import corpus from '../data/corpus.json';
import type { SourceDocument } from '../core/types';
import type { Env } from '../worker/env';
const chunks = chunkDocuments(corpus.documents as SourceDocument[]);
const chunk = chunks.find((c) => c.documentId === 'returns')!;
const now = Date.now();
const entry = {
  answer: 'İade süresi 30 gündür [S1].',
  provider: 'workers-ai',
  model: 'gemma',
  createdAt: now,
  expiresAt: now + CACHE_TTL_MS,
  citations: [
    {
      id: 'S1',
      documentId: chunk.documentId,
      title: chunk.title,
      heading: chunk.heading,
      excerpt: chunk.text,
      version: chunk.version,
      effectiveDate: chunk.effectiveDate,
    },
  ],
};
describe('answer cache boundaries', () => {
  it('accepts current public evidence and rejects expired answers', () => {
    expect(validateCacheEntry(entry, chunks, now)).not.toBeNull();
    expect(validateCacheEntry(entry, chunks, entry.expiresAt)).toBeNull();
  });
  it('rejects stale, internal and modified source excerpts', () => {
    for (const change of [
      { version: 999 },
      { audience: 'operations' as const },
      { status: 'archived' as const },
      { text: 'Changed' },
    ]) {
      expect(
        validateCacheEntry(
          entry,
          chunks.map((c) => (c.id === chunk.id ? { ...c, ...change } : c)),
          now,
        ),
      ).toBeNull();
    }
  });
  it('rejects malformed and unknown citations', () => {
    expect(validateCacheEntry({ ...entry, answer: '30 gün [S99]' }, chunks, now)).toBeNull();
    expect(validateCacheEntry({ ...entry, citations: [] }, chunks, now)).toBeNull();
  });
  it('invalidates on corpus or model changes, preserves question distinctions', async () => {
    const env = {
      MODEL_ROUTE: 'cloud-first',
      LOCAL_MODEL: 'local',
      OPENROUTER_MODEL: 'gemma',
    } as Env;
    const key = await cacheKey('İade süresi?', 'hash1', env);
    expect(await cacheKey('  İade   süresi?  ', 'hash1', env)).toBe(key);
    expect(await cacheKey('İade süresi?', 'hash2', env)).not.toBe(key);
    expect(
      await cacheKey('İade süresi?', 'hash1', { ...env, MODEL_ROUTE: 'local-first' }),
    ).not.toBe(key);
    expect(await cacheKey('İade süresi', 'hash1', env)).not.toBe(key);
  });
});

import app from '../worker/index';
import { vi } from 'vitest';
function apiEnvironment() {
  const statements: string[] = [];
  const guard = vi.fn(async () => Response.json({ allowed: false }));
  const db = {
    prepare: (sql: string) => {
      statements.push(sql);
      return {
        bind: (..._args: unknown[]) => ({
          first: async () =>
            sql.startsWith('SELECT response_json')
              ? { response_json: JSON.stringify(entry) }
              : null,
          all: async () => ({ results: [] }),
          run: async () => ({}),
        }),
      };
    },
  };
  return {
    statements,
    guard,
    env: {
      DB: db,
      GUARD: { idFromName: () => 'budget', get: () => ({ fetch: guard }) },
      MODEL_ROUTE: 'cloud-first',
      LOCAL_MODEL: 'gemma',
      OPENROUTER_MODEL: 'gemma',
      RAGNA_API_KEY: 'operator-test',
      DAILY_BUDGET_USD: '1',
    } as unknown as Env,
  };
}
describe('cache API routing', () => {
  it('ignores visitor refresh flags and reuses public cache before reserving model budget', async () => {
    const { env, guard } = apiEnvironment();
    guard.mockResolvedValue(Response.json({ allowed: true }));
    const response = await app.fetch(
      new Request('https://ragna.test/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'İade süresi?',
          refreshCache: true,
          audience: 'operations',
        }),
      }),
      env,
    );
    const body = (await response.json()) as {
      mode: string;
      usage: { costUsd: number };
      cache: unknown;
    };
    expect(body.mode).toBe('cached');
    expect(body.usage.costUsd).toBe(0);
    expect(body.cache).toBeTruthy();
    expect(guard.mock.calls).toHaveLength(1);
    expect((guard.mock.calls[0] as unknown as [Request])[0].url).toBe('https://guard/cache-access');
  });
  it('never reads the shared cache for an authorized operations scope', async () => {
    const { env, statements } = apiEnvironment();
    await app.fetch(
      new Request('https://ragna.test/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer operator-test' },
        body: JSON.stringify({ question: 'İade süresi?', audience: 'operations' }),
      }),
      env,
    );
    expect(statements.some((s) => s.includes('answer_cache'))).toBe(false);
  });
  it('allows authenticated evaluations to bypass cache', async () => {
    const { env, statements } = apiEnvironment();
    await app.fetch(
      new Request('https://ragna.test/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer operator-test' },
        body: JSON.stringify({ question: 'İade süresi?', refreshCache: true }),
      }),
      env,
    );
    expect(statements.some((s) => s.startsWith('SELECT response_json'))).toBe(false);
  });
});
