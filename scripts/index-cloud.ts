import { loadSecrets } from './env';
await loadSecrets();
const base = process.env.RAGNA_URL;
if (!base || !process.env.RAGNA_API_KEY)
  throw new Error('RAGNA_URL and RAGNA_API_KEY are required.');
async function post(body: unknown) {
  const r = await fetch(`${base}/api/admin/index`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RAGNA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await r.json()) as {
    error?: string;
    done?: boolean;
    next: number;
    total: number;
    ready?: boolean;
    found?: number;
  };
  if (!r.ok) throw new Error(`Indexing: ${r.status} ${data.error || ''}`);
  return data;
}
let offset = 0;
while (!process.argv.includes('--verify')) {
  const r = await post({ offset });
  if (r.done) break;
  console.log(`Indexed ${r.next}/${r.total}`);
  offset = r.next;
  if (offset >= r.total) break;
}
for (let attempt = 0; attempt < 12; attempt++) {
  const r = await post({ offset: 0, verify: true });
  if (r.ready) {
    console.log('Vector index verified and activated.');
    process.exit(0);
  }
  console.log(`Waiting for asynchronous Vectorize mutation: ${r.found}/${r.total || 'expected'}`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
throw new Error(
  'Vectorize has not completed ingestion yet. Retry verification later; lexical retrieval remains available.',
);
