import type { Span } from './types';

export const trafficSources = [
  'visitor',
  'operator',
  'evaluation',
  'smoke',
  'warmup',
  'legacy',
] as const;
export type TrafficSource = (typeof trafficSources)[number];
export type TrafficScope = TrafficSource | 'all';
export const trafficLabels: Record<TrafficScope, string> = {
  all: 'Tüm trafik',
  visitor: 'Ziyaretçiler',
  operator: 'Operatör / Open WebUI',
  evaluation: 'Değerlendirme',
  smoke: 'Smoke test',
  warmup: 'Cache hazırlığı',
  legacy: 'Eski / sınıflandırılmamış',
};
export function classifyTraffic(request: Request, trusted: boolean): TrafficSource {
  if (!trusted) return 'visitor';
  const source = request.headers.get('X-Ragna-Traffic');
  return source === 'evaluation' || source === 'smoke' || source === 'warmup' ? source : 'operator';
}
export type MetricRow = Record<string, unknown>;
const validNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function latency(values: unknown[]) {
  const sorted = values.filter(validNumber).sort((a, b) => a - b);
  const p = (q: number) => (sorted.length ? sorted[Math.ceil(sorted.length * q) - 1] : null);
  return { count: sorted.length, p50Ms: p(0.5), p95Ms: p(0.95) };
}
export function readSpans(value: unknown): Span[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter(
          (s): s is Span =>
            s &&
            typeof s.name === 'string' &&
            validNumber(s.durationMs) &&
            ['ok', 'error', 'skipped'].includes(s.status),
        )
      : [];
  } catch {
    return [];
  }
}
const providerNames = ['workers-ai', 'ollama', 'openrouter'];
export function summarizeMetrics(rows: MetricRow[]) {
  const entries = rows.map((r) => ({
    r,
    spans: readSpans(r.spans_json).filter(
      (s) => providerNames.includes(s.name) && s.status !== 'skipped',
    ),
  }));
  const inference = entries.filter(
    (e) => e.spans.length > 0 && e.r.mode !== 'cached' && e.r.provider !== 'review-fixture',
  );
  const requested = rows.filter(
    (r) => r.mode !== 'guided' && r.provider !== 'review-fixture' && r.guided_requested !== 1,
  );
  const cached = rows.filter((r) => r.mode === 'cached');
  const rated = rows.filter((r) => r.rating === 1 || r.rating === -1);
  const generated = inference.filter((e) => e.r.model != null);
  const reported = generated.filter((e) => validNumber(e.r.cost_usd));
  const fallback = inference.filter((e) => e.spans.some((s) => s.status === 'error'));
  const latencyByMode = Object.fromEntries(
    ['live', 'cached', 'guided', 'evidence', 'abstained'].map((mode) => [
      mode,
      latency(rows.filter((r) => r.mode === mode).map((r) => r.duration_ms)),
    ]),
  );
  const providers = providerNames.map((provider) => {
    const attempts = inference.flatMap((e) => e.spans.filter((s) => s.name === provider));
    const errors = attempts.filter((s) => s.status === 'error');
    const timeouts = errors.filter(
      (s) => s.errorKind === 'timeout' || /timeout|timed out/i.test(s.detail || ''),
    );
    const switched = inference.filter((e) =>
      e.spans.some((s, i) => s.name === provider && s.status === 'error' && i < e.spans.length - 1),
    );
    return {
      provider,
      attempts: attempts.length,
      successes: attempts.length - errors.length,
      errors: errors.length,
      timeouts: timeouts.length,
      errorRate: attempts.length ? errors.length / attempts.length : null,
      timeoutRate: attempts.length ? timeouts.length / attempts.length : null,
      fallbackCount: switched.length,
      fallbackRate: attempts.length ? switched.length / attempts.length : null,
      ...latency(attempts.map((s) => s.durationMs)),
    };
  });
  return {
    total: rows.length,
    sampleSize: rows.length,
    live: rows.filter((r) => r.mode === 'live').length,
    cached: cached.length,
    guided: rows.filter((r) => r.mode === 'guided').length,
    evidence: rows.filter((r) => r.mode === 'evidence').length,
    abstained: rows.filter((r) => r.mode === 'abstained').length,
    cacheEligibleCount: requested.length,
    cacheHitRate: requested.length ? cached.length / requested.length : null,
    ...{
      p50Ms: latency(rows.map((r) => r.duration_ms)).p50Ms,
      p95Ms: latency(rows.map((r) => r.duration_ms)).p95Ms,
    },
    latencyByMode,
    stages: {
      retrieval: latency(
        rows
          .filter(
            (r) =>
              r.mode !== 'cached' &&
              r.mode !== 'guided' &&
              r.provider !== 'review-fixture' &&
              r.guided_requested !== 1,
          )
          .map((r) => r.retrieval_ms),
      ),
      generation: latency(inference.map((e) => e.spans.reduce((sum, s) => sum + s.durationMs, 0))),
    },
    inferenceCount: inference.length,
    fallbackCount: fallback.length,
    fallbackRate: inference.length ? fallback.length / inference.length : null,
    recoveredCount: fallback.filter((e) => e.spans.at(-1)?.status === 'ok').length,
    providers,
    reportedCostUsd: reported.length
      ? reported.reduce((s, e) => s + Number(e.r.cost_usd), 0)
      : null,
    costReportedCount: reported.length,
    costSampleCount: generated.length,
    costCoverage: generated.length ? reported.length / generated.length : null,
    positiveFeedback: rated.length
      ? rated.filter((r) => r.rating === 1).length / rated.length
      : null,
    feedbackCount: rated.length,
    requests: rows.slice(0, 20).map((r) => ({
      id: String(r.id),
      createdAt: String(r.created_at),
      mode: String(r.mode),
      provider: String(r.provider),
      model: r.model == null ? null : String(r.model),
      durationMs: Number(r.duration_ms),
      retrievalMode: String(r.retrieval_mode),
      fallbackReason: r.fallback_reason == null ? null : String(r.fallback_reason),
      trafficSource: String(r.traffic_source),
      spans: readSpans(r.spans_json),
    })),
  };
}
export type Metrics = ReturnType<typeof summarizeMetrics> & {
  scope: TrafficScope;
  window: string;
  since: string;
  until: string;
  matchedCount: number;
  truncated: boolean;
  trafficCounts: Record<TrafficSource, number>;
  budget: {
    reservedUsd: number;
    dailyLimitUsd: number;
    requests: number;
    dailyRequestLimit: number;
  };
};
