import { z } from 'zod';
import type { ChatResponse, Chunk } from '../core/types';
import type { Env } from './env';
import { parseGroundedOutput } from '../core/retrieval';

export const CACHE_POLICY = 'grounded-v2-cache-v1';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const entrySchema = z.object({
  answer: z.string().min(1).max(20000),
  provider: z.string(),
  model: z.string(),
  citations: z
    .array(
      z.object({
        id: z.string(),
        documentId: z.string(),
        title: z.string(),
        heading: z.string(),
        excerpt: z.string(),
        version: z.number(),
        effectiveDate: z.string(),
      }),
    )
    .min(1)
    .max(5),
  createdAt: z.number(),
  expiresAt: z.number(),
});
export type CacheEntry = z.infer<typeof entrySchema>;
export async function cacheKey(question: string, corpusHash: string, env: Env) {
  // Preserve case/punctuation: a semantic near-match must never reuse a factual answer.
  const identity = JSON.stringify([
    CACHE_POLICY,
    corpusHash,
    'public',
    env.MODEL_ROUTE,
    env.LOCAL_MODEL,
    env.OPENROUTER_MODEL,
    Boolean(env.AI),
    Boolean(env.OPENROUTER_API_KEY),
    question.normalize('NFC').trim().replace(/\s+/g, ' '),
  ]);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function validateCacheEntry(
  value: unknown,
  chunks: Chunk[],
  now = Date.now(),
): CacheEntry | null {
  const parsed = entrySchema.safeParse(value);
  if (!parsed.success) return null;
  const entry = parsed.data;
  if (
    entry.expiresAt <= now ||
    entry.createdAt > now ||
    entry.expiresAt - entry.createdAt > CACHE_TTL_MS
  )
    return null;
  if (
    !entry.citations.every((c) =>
      chunks.some(
        (chunk) =>
          chunk.audience === 'public' &&
          chunk.status === 'current' &&
          chunk.documentId === c.documentId &&
          chunk.version === c.version &&
          chunk.text === c.excerpt &&
          chunk.heading === c.heading &&
          chunk.title === c.title &&
          chunk.effectiveDate === c.effectiveDate,
      ),
    )
  )
    return null;
  if (
    !parseGroundedOutput(
      JSON.stringify({
        answer: entry.answer,
        citations: entry.citations.map((c) => c.id),
        abstained: false,
      }),
      new Set(entry.citations.map((c) => c.id)),
    )
  )
    return null;
  return entry;
}
export async function readCache(env: Env, key: string, chunks: Chunk[]) {
  try {
    const row = await env.DB.prepare(
      'SELECT response_json FROM answer_cache WHERE cache_key=? AND expires_at>?',
    )
      .bind(key, Date.now())
      .first<{ response_json: string }>();
    return row ? validateCacheEntry(JSON.parse(row.response_json), chunks) : null;
  } catch {
    return null;
  } // Cache failure must not block retrieval.
}
export async function writeCache(env: Env, key: string, result: ChatResponse, chunks: Chunk[]) {
  if (result.mode !== 'live' || !result.model || result.citationValidity !== 1) return;
  const now = Date.now();
  const entry = validateCacheEntry(
    { ...result, createdAt: now, expiresAt: now + CACHE_TTL_MS },
    chunks,
    now,
  );
  if (!entry) return;
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM answer_cache WHERE expires_at<=?').bind(now),
      env.DB.prepare(
        'INSERT INTO answer_cache(cache_key,response_json,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json,created_at=excluded.created_at,expires_at=excluded.expires_at',
      ).bind(key, JSON.stringify(entry), now, entry.expiresAt),
      env.DB.prepare(
        'DELETE FROM answer_cache WHERE cache_key IN (SELECT cache_key FROM answer_cache ORDER BY created_at DESC,cache_key LIMIT -1 OFFSET 1000)',
      ),
    ]);
  } catch {
    console.error(JSON.stringify({ type: 'answer_cache_write_failed' }));
  }
}
