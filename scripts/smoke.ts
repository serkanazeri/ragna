import assert from 'node:assert/strict';
import { loadSecrets } from './env';
await loadSecrets();
if (!process.env.RAGNA_API_KEY)
  throw new Error('Smoke trafiğini sınıflandırmak için RAGNA_API_KEY gerekli.');
const base = process.env.RAGNA_URL || 'http://127.0.0.1:8787';
async function get(path: string) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200, path);
  return r.json() as Promise<any>;
}
const status = await get('/api/status');
assert.equal(status.name, 'RAGNA');
const sources = await get('/api/corpus');
assert(sources.documents.length >= 16);
assert(sources.documents.every((d: any) => d.audience === 'public' && d.status === 'current'));
assert.equal((await fetch(base + '/api/sources/commission')).status, 404);
assert.equal((await fetch(base + '/api/sources/returns-archive')).status, 404);
assert.equal((await fetch(base + '/api/admin/index', { method: 'POST', body: '{}' })).status, 401);
assert.equal((await fetch(base + '/v1/models')).status, 401);
const r = await fetch(base + '/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.RAGNA_API_KEY}`,
    'X-Ragna-Traffic': 'smoke',
  },
  body: JSON.stringify({ question: 'İade süresi kaç gün?', guided: true, audience: 'public' }),
});
assert.equal(r.status, 200);
const answer = (await r.json()) as any;
assert.equal(answer.mode, 'guided');
assert(answer.answer.includes('30'));
assert(answer.citations.some((c: any) => c.documentId === 'returns'));
const fb = await fetch(base + '/api/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requestId: answer.requestId, rating: 1 }),
});
assert.equal(fb.status, 200);
const m = await get('/api/metrics');
assert(m.total >= 1);
assert(m.feedbackCount >= 1);
const smoke = await get('/api/metrics?traffic=smoke');
assert(smoke.requests.some((r: any) => r.id === answer.requestId));
const visitors = await get('/api/metrics?traffic=visitor');
assert(!visitors.requests.some((r: any) => r.id === answer.requestId));
console.log(
  `Smoke checks passed: ${base}. Sources, access control, guided answers, feedback, metrics.`,
);
