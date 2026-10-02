import { readFile, writeFile } from 'node:fs/promises';
import { loadSecrets } from './env';
import type { ChatResponse } from '../core/types';
await loadSecrets();
if (!process.env.RAGNA_API_KEY) throw new Error('RAGNA_API_KEY gerekli.');
const base = process.env.RAGNA_URL || 'http://localhost:8787';
const set = JSON.parse(await readFile('data/review-set.json', 'utf8'));
const previous = JSON.parse(await readFile('reports/review-candidates.json', 'utf8'));
const results: { questionId: string; collectedAt: string; answer: ChatResponse }[] =
  previous.corpusHash === set.corpusHash ? previous.results : [];
const state = (await (await fetch(base + '/api/status')).json()) as { corpusHash: string };
if (state.corpusHash !== set.corpusHash)
  throw new Error('İnceleme seti ve canlı corpus hash farklı.');
for (const q of set.questions) {
  if (results.some((r) => r.questionId === q.id) && !process.argv.includes('--refresh')) continue;
  const response = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RAGNA_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Ragna-Traffic': 'evaluation',
    },
    body: JSON.stringify({ question: q.question, refreshCache: true }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Üretim başarısız: ${response.status}`);
  const answer = (await response.json()) as ChatResponse;
  if (answer.fallbackReason === 'demo_quota')
    throw new Error(
      `Demo kotası doldu; ${results.length} kayıt korundu. Daha sonra aynı komutla devam edin.`,
    );
  if (!['live', 'abstained', 'evidence'].includes(answer.mode))
    throw new Error(`Beklenmeyen yanıt türü: ${q.id} (${answer.mode})`);
  const index = results.findIndex((r) => r.questionId === q.id);
  if (index >= 0) results.splice(index, 1);
  results.push({ questionId: q.id, collectedAt: new Date().toISOString(), answer });
  await writeFile(
    'reports/review-candidates.json',
    JSON.stringify(
      { corpusHash: set.corpusHash, status: 'pending-human-review', results },
      null,
      2,
    ) + '\n',
  );
  console.log(`${q.id}: ${answer.mode} · ${results.length}/${set.questions.length}`);
  await new Promise((resolve) => setTimeout(resolve, 2100));
}
