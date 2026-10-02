import type { Env } from './env';
export async function healthStatus(env: Env) {
  const start = performance.now();
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    const latest = await env.DB.prepare(
      'SELECT checked_at,status,duration_ms,provider,mode,reason FROM health_checks ORDER BY checked_at DESC LIMIT 1',
    ).first<{
      checked_at: string;
      status: string;
      duration_ms: number;
      provider: string | null;
      mode: string | null;
      reason: string | null;
    }>();
    const recent = await env.DB.prepare(
      'SELECT status,checked_at FROM health_checks WHERE checked_at>=? ORDER BY checked_at DESC LIMIT 100',
    )
      .bind(new Date(Date.now() - 7 * 86400000).toISOString())
      .all<{ status: string; checked_at: string }>();
    const age = latest ? Date.now() - Date.parse(latest.checked_at) : null;
    return {
      api: 'ok' as const,
      checkedAt: new Date().toISOString(),
      durationMs: performance.now() - start,
      inference: {
        status: !latest ? 'unknown' : age! > 9 * 3600000 ? 'stale' : latest.status,
        lastCheck: latest,
      },
      checks7d: recent.results.length,
      successfulChecks7d: recent.results.filter((r) => r.status === 'ok').length,
      note: 'Periyodik kontrol sonuçlarıdır; kesintisiz uptime veya yanıt doğruluğu garantisi değildir.',
    };
  } catch {
    return {
      api: 'error' as const,
      checkedAt: new Date().toISOString(),
      durationMs: performance.now() - start,
      inference: { status: 'unknown', lastCheck: null },
      checks7d: 0,
      successfulChecks7d: 0,
      note: 'Veritabanı sağlık kontrolü tamamlanamadı.',
    };
  }
}
