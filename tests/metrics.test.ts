import { describe, expect, it } from 'vitest';
import { classifyTraffic, latency, summarizeMetrics, type MetricRow } from '../core/metrics';
import app from '../worker/index';
import type { Env } from '../worker/env';
const row = (changes: MetricRow = {}): MetricRow => ({
  id: 'r',
  created_at: '2026-10-02T12:00:00Z',
  mode: 'live',
  provider: 'workers-ai',
  model: 'gemma',
  duration_ms: 1100,
  retrieval_ms: 100,
  retrieval_mode: 'hybrid',
  fallback_reason: null,
  spans_json: JSON.stringify([{ name: 'workers-ai', durationMs: 1000, status: 'ok' }]),
  cost_usd: null,
  rating: null,
  traffic_source: 'visitor',
  guided_requested: 0,
  ...changes,
});
describe('ayrıştırılmış operasyon metrikleri', () => {
  it('cache ve kayıtlı örneklerin sürelerini canlı modelden ayırır', () => {
    const m = summarizeMetrics([
      row(),
      row({
        mode: 'cached',
        provider: 'cache',
        duration_ms: 4,
        retrieval_ms: 0,
        spans_json: '[]',
        cost_usd: 0,
      }),
      row({
        mode: 'guided',
        provider: 'review-fixture',
        model: null,
        duration_ms: 12,
        spans_json: '[]',
        guided_requested: 1,
      }),
    ]);
    expect(m.latencyByMode.live).toEqual({ count: 1, p50Ms: 1100, p95Ms: 1100 });
    expect(m.latencyByMode.cached.p95Ms).toBe(4);
    expect(m.stages.retrieval.count).toBe(1);
    expect(m.stages.generation.p95Ms).toBe(1000);
    expect(m.cacheHitRate).toBe(0.5);
    expect(m.reportedCostUsd).toBeNull();
    expect(m.costCoverage).toBe(0);
  });
  it('boş/bozuk süreleri sıfıra dönüştürmez; nearest-rank kullanır', () => {
    expect(latency([null, undefined, NaN, -1, '10'])).toEqual({
      count: 0,
      p50Ms: null,
      p95Ms: null,
    });
    expect(latency([0, 10, 20, 30])).toEqual({ count: 4, p50Ms: 10, p95Ms: 30 });
    expect(summarizeMetrics([]).fallbackRate).toBeNull();
    expect(summarizeMetrics([row({ spans_json: 'broken' })]).stages.generation.count).toBe(0);
  });
  it('hata/timeout/geçiş paydasını sağlayıcı denemelerinden hesaplar', () => {
    const m = summarizeMetrics([
      row({
        provider: 'openrouter',
        cost_usd: 0.002,
        spans_json: JSON.stringify([
          { name: 'workers-ai', durationMs: 12000, status: 'error', detail: 'workers-ai:timeout' },
          { name: 'openrouter', durationMs: 500, status: 'ok' },
        ]),
      }),
      row({
        mode: 'evidence',
        provider: 'evidence',
        model: null,
        spans_json: JSON.stringify([
          {
            name: 'workers-ai',
            durationMs: 5,
            status: 'error',
            detail: 'invalid_citations_or_schema',
          },
        ]),
      }),
      row({
        mode: 'evidence',
        provider: 'evidence',
        model: null,
        fallback_reason: 'demo_quota',
        spans_json: '[]',
      }),
      row({ mode: 'abstained' }),
    ]);
    const cf = m.providers.find((p) => p.provider === 'workers-ai')!;
    expect(cf.attempts).toBe(3);
    expect(cf.errors).toBe(2);
    expect(cf.timeouts).toBe(1);
    expect(cf.errorRate).toBe(2 / 3);
    expect(cf.timeoutRate).toBe(1 / 3);
    expect(cf.fallbackRate).toBe(1 / 3);
    expect(m.inferenceCount).toBe(3);
    expect(m.fallbackCount).toBe(2);
    expect(m.recoveredCount).toBe(1);
    expect(m.stages.generation.p95Ms).toBe(12500);
    expect(m.reportedCostUsd).toBe(0.002);
    expect(m.costReportedCount).toBe(1);
    expect(m.costSampleCount).toBe(2);
  });
  it('kayıtlı abstention ve başarısız guided isteklerini retrieval/cache paydasından çıkarır', () => {
    const m = summarizeMetrics([
      row({ mode: 'abstained', provider: 'review-fixture', model: null, spans_json: '[]' }),
      row({ mode: 'evidence', provider: 'evidence', spans_json: '[]', guided_requested: 1 }),
    ]);
    expect(m.cacheEligibleCount).toBe(0);
    expect(m.stages.retrieval.count).toBe(0);
  });
  it('yalnızca gerçek oyları geri bildirim paydasına alır', () => {
    expect(
      summarizeMetrics([row({ rating: 1 }), row({ rating: -1 }), row(), row({ rating: undefined })])
        .positiveFeedback,
    ).toBe(0.5);
  });
  it('ziyaretçi etiket sahteciliğini reddeder ve operatörü test olarak varsaymaz', () => {
    const r = new Request('https://test', { headers: { 'X-Ragna-Traffic': 'evaluation' } });
    expect(classifyTraffic(r, false)).toBe('visitor');
    expect(classifyTraffic(r, true)).toBe('evaluation');
    expect(classifyTraffic(new Request('https://test'), true)).toBe('operator');
    expect(
      classifyTraffic(
        new Request('https://test', { headers: { 'X-Ragna-Traffic': 'legacy' } }),
        true,
      ),
    ).toBe('operator');
  });
});
describe('metrik API sözleşmesi', () => {
  function env(size: number) {
    const queries: { sql: string; args: unknown[] }[] = [];
    return {
      queries,
      bindings: {
        DB: {
          prepare: (sql: string) => ({
            bind: (...args: unknown[]) => {
              queries.push({ sql, args });
              return {
                all: async () => ({
                  results: sql.includes('GROUP BY')
                    ? [{ traffic_source: 'visitor', count: size }]
                    : Array.from({ length: Math.min(size, 1001) }, (_, i) =>
                        row({ id: String(i) }),
                      ),
                }),
              };
            },
          }),
        },
        GUARD: {
          idFromName: () => 'budget',
          get: () => ({
            fetch: async () =>
              Response.json({
                requests: 1,
                reservedUsd: 0.01,
                dailyLimitUsd: 1,
                dailyRequestLimit: 100,
              }),
          }),
        },
      } as unknown as Env,
    };
  }
  it('filtreyi limitten önce SQL ile uygular ve gerçek kesilmeyi bildirir', async () => {
    for (const size of [1000, 1001]) {
      const e = env(size);
      const r = await app.fetch(
        new Request('https://test/api/metrics?traffic=visitor'),
        e.bindings,
      );
      const m = (await r.json()) as any;
      expect(m.scope).toBe('visitor');
      expect(m.sampleSize).toBe(1000);
      expect(m.matchedCount).toBe(size);
      expect(m.truncated).toBe(size > 1000);
      expect(e.queries[1].args.slice(-2)).toEqual(['visitor', 'visitor']);
      expect(e.queries[1].sql).toContain('r.traffic_source=');
    }
  });
  it('bilinmeyen filtreyi veritabanına göndermeden reddeder', async () => {
    const e = env(0);
    expect(
      (await app.fetch(new Request('https://test/api/metrics?traffic=bad'), e.bindings)).status,
    ).toBe(400);
    expect(e.queries).toHaveLength(0);
  });
});
