import { writeFile } from 'node:fs/promises';
const base = process.env.RAGNA_URL || 'https://ragna.serkanazeri.workers.dev';
const findings: { check: string; ok: boolean; detail: string }[] = [];
for (const [path, check] of [
  ['/', 'Arayüz'],
  ['/api/health', 'API ve model kontrolü'],
  ['/manifest.webmanifest', 'PWA manifest'],
] as const) {
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (path === '/api/health') {
      const h = (await r.json()) as any;
      findings.push({
        check,
        ok: h.api === 'ok' && h.inference.status === 'ok',
        detail: `API: ${h.api}; model: ${h.inference.status}`,
      });
    } else if (path === '/') {
      const text = await r.text();
      findings.push({
        check,
        ok: text.includes('RAGNA') && text.includes('id="root"'),
        detail: `HTTP ${r.status}`,
      });
    } else {
      const m = (await r.json()) as any;
      findings.push({
        check,
        ok: m.lang === 'tr' && Boolean(m.start_url),
        detail: `HTTP ${r.status}`,
      });
    }
  } catch (e) {
    findings.push({
      check,
      ok: false,
      detail: e instanceof Error ? e.message : 'Kontrol başarısız',
    });
  }
}
await writeFile(
  'reports/availability.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), base, findings }, null, 2) + '\n',
);
console.table(findings);
if (findings.some((f) => !f.ok)) process.exitCode = 1;
