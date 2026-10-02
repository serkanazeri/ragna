import { writeFile } from 'node:fs/promises';
import questions from '../data/questions.json';
import { loadSecrets } from './env';
await loadSecrets();
const base = process.env.RAGNA_URL;
if (!base || !process.env.RAGNA_API_KEY) throw new Error('RAGNA_URL and RAGNA_API_KEY required.');
const rows: {
  questionId: string;
  category: string;
  split: string;
  mode: string;
  corpusHash: string;
  durationMs: number;
  recall: number | null;
  mrr: number | null;
  ndcg: number | null;
  leaks: number;
  retrievedIds: string[];
  spans: unknown[];
}[] = [];
for (const q of questions) {
  const response = await fetch(`${base}/api/admin/retrieve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RAGNA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: q.question,
      audience: q.audience,
      lexicalOnly: process.env.LEXICAL_ONLY === '1',
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Retrieval failed: ${response.status}`);
  const r = (await response.json()) as {
    mode: string;
    corpusHash: string;
    durationMs: number;
    hits: { documentId: string; audience: string; status: string }[];
    spans: unknown[];
  };
  const ids = [...new Set(r.hits.map((h) => h.documentId))];
  const hits = ids.filter((id) => q.evidence.includes(id));
  const first = ids.findIndex((id) => q.evidence.includes(id));
  const dcg = ids.reduce((s, id, i) => s + (q.evidence.includes(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = q.evidence.reduce((s, _, i) => s + 1 / Math.log2(i + 2), 0);
  rows.push({
    questionId: q.id,
    category: q.category,
    split: q.split,
    mode: r.mode,
    corpusHash: r.corpusHash,
    durationMs: r.durationMs,
    recall: q.evidence.length ? hits.length / q.evidence.length : null,
    mrr: q.evidence.length ? (first < 0 ? 0 : 1 / (first + 1)) : null,
    ndcg: ideal ? dcg / ideal : null,
    leaks: r.hits.filter(
      (h) => h.status !== 'current' || (q.audience === 'public' && h.audience !== 'public'),
    ).length,
    retrievedIds: ids,
    spans: r.spans,
  });
  console.log(`${q.id}: ${r.mode} · recall ${rows.at(-1)!.recall ?? 'n/a'}`);
}
const summarize = (items: typeof rows) => {
  const answerable = items.filter((r) => r.recall !== null);
  const lat = items.map((r) => r.durationMs).sort((a, b) => a - b);
  return {
    questions: items.length,
    answerable: answerable.length,
    recallAt5: answerable.reduce((s, r) => s + r.recall!, 0) / answerable.length,
    mrr: answerable.reduce((s, r) => s + r.mrr!, 0) / answerable.length,
    ndcgAt5: answerable.reduce((s, r) => s + r.ndcg!, 0) / answerable.length,
    accessLeaks: items.reduce((s, r) => s + r.leaks, 0),
    p95Ms: lat[Math.ceil(lat.length * 0.95) - 1],
    hybridRequests: items.filter((r) => r.mode === 'hybrid-rrf').length,
  };
};
const report = {
  createdAt: new Date().toISOString(),
  base,
  configuration: {
    embedding: 'BGE-M3 1024d',
    chunks: 'sections-450',
    ranking: 'FTS5 + Vectorize / RRF k=60',
  },
  metrics: summarize(rows),
  holdoutMetrics: summarize(rows.filter((r) => r.split === 'test')),
  results: rows,
  limitations: [
    'Synthetic fixture; not a production quality estimate.',
    'End-to-end retrieval only, no generation or semantic correctness score.',
    'A hybrid label confirms both paths ran, not that every hit came from vector search.',
  ],
};
const path = `reports/live-retrieval-${Date.now()}.json`;
await writeFile(path, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({ path, metrics: report.metrics, holdout: report.holdoutMetrics }, null, 2),
);
