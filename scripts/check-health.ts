import { loadSecrets } from './env';
await loadSecrets();
if (!process.env.RAGNA_API_KEY) throw new Error('RAGNA_API_KEY gerekli.');
const base = process.env.RAGNA_URL || 'http://localhost:8787';
const response = await fetch(base + '/api/admin/health-check', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.RAGNA_API_KEY}` },
  signal: AbortSignal.timeout(90000),
});
if (!response.ok) throw new Error(`Sağlık kontrolü başarısız: HTTP ${response.status}`);
const status = (await response.json()) as { api: string; inference: { status: string } };
console.log(JSON.stringify(status, null, 2));
if (status.api !== 'ok' || status.inference.status !== 'ok') process.exitCode = 1;
