import { useEffect, useState } from 'react';
type Health = {
  api: string;
  checkedAt: string;
  inference: { status: string; lastCheck: { checked_at: string; provider: string } | null };
  checks7d: number;
  successfulChecks7d: number;
};
const names: Record<string, string> = {
  ok: 'Çalışıyor',
  error: 'Sorun var',
  unknown: 'Henüz ölçülmedi',
  stale: 'Kontrol güncel değil',
};
export default function HealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const r = await fetch('/api/health', { signal: AbortSignal.timeout(15000) });
        const h = (await r.json()) as Health;
        if (active) {
          setHealth(h);
          setError(!r.ok);
        }
      } catch {
        if (active) setError(true);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="panel health-panel" aria-label="Sistem durumu">
      <div>
        <h2>Sistem durumu</h2>
        <p>
          API{' '}
          <strong>
            {error ? 'Erişilemiyor' : health ? names[health.api] : 'Kontrol ediliyor…'}
          </strong>{' '}
          · Model <strong>{health ? names[health.inference.status] : '—'}</strong>
        </p>
        <p>
          Son gerçek model kontrolü:{' '}
          {health?.inference.lastCheck
            ? new Date(health.inference.lastCheck.checked_at).toLocaleString('tr-TR')
            : 'Henüz yok'}{' '}
          · {health?.inference.lastCheck?.provider || '—'}
        </p>
        <small>
          Model kontrolü 6 saatte bir, dış erişim kontrolü GitHub Actions ile yaklaşık 2 saatte bir
          çalışır. Son 7 gün: {health?.successfulChecks7d ?? 0}/{health?.checks7d ?? 0} model
          kontrolü başarılı. Bu oran uptime değildir.
        </small>
      </div>
      <a
        href="https://github.com/serkanazeri/ragna/actions/workflows/availability.yml"
        target="_blank"
        rel="noreferrer"
      >
        Dış kontrol geçmişi ↗
      </a>
    </section>
  );
}
