import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import corpus from '../data/corpus.json';
import rawQuestions from '../data/questions.json';
import { chunkDocuments, lexicalSearch } from '../core/retrieval';
import type { SourceDocument, Question, EvalResult, EvalRun } from '../core/types';

const questions = rawQuestions as Question[];
const datasetHash = createHash('sha256').update(JSON.stringify(questions)).digest('hex');
const runs: EvalRun[] = [];
for (const config of [
  { strategy: 'sections', size: 250 },
  { strategy: 'sections', size: 450 },
  { strategy: 'fixed', size: 450 },
]) {
  const chunks = chunkDocuments(corpus.documents as SourceDocument[], config.size, config.strategy);
  const results: EvalResult[] = questions.map((q) => {
    const start = performance.now();
    const hits = lexicalSearch(q.question, chunks, q.audience, 5);
    const latencyMs = performance.now() - start;
    const ids = [...new Set(hits.map((h) => h.chunk.documentId))];
    const matched = q.evidence.filter((id) => ids.includes(id));
    let dcg = 0;
    ids.forEach((id, i) => {
      if (q.evidence.includes(id)) dcg += 1 / Math.log2(i + 2);
    });
    const idcg = q.evidence.reduce((s, _, i) => s + 1 / Math.log2(i + 2), 0);
    return {
      questionId: q.id,
      category: q.category,
      split: q.split,
      recall: q.evidence.length ? matched.length / q.evidence.length : null,
      mrr: q.evidence.length
        ? ids.findIndex((id) => q.evidence.includes(id)) < 0
          ? 0
          : 1 / (ids.findIndex((id) => q.evidence.includes(id)) + 1)
        : null,
      ndcg: idcg ? dcg / idcg : null,
      shouldAbstain: q.shouldAbstain,
      retrievedIds: ids,
      deniedLeakCount: hits.filter(
        (h) =>
          h.chunk.status === 'archived' ||
          (q.audience === 'public' && h.chunk.audience !== 'public'),
      ).length,
      latencyMs,
    };
  });
  const answerable = results.filter((r) => r.recall !== null);
  const times = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  runs.push({
    id: `lexical-${config.strategy}-${config.size}`,
    createdAt: new Date().toISOString(),
    corpusVersion: corpus.version,
    datasetHash,
    kind: 'offline-retrieval',
    strategy: config.strategy,
    chunkSize: config.size,
    questionCount: results.length,
    metrics: {
      recallAt5: answerable.reduce((s, r) => s + r.recall!, 0) / answerable.length,
      mrr: answerable.reduce((s, r) => s + r.mrr!, 0) / answerable.length,
      ndcgAt5: answerable.reduce((s, r) => s + r.ndcg!, 0) / answerable.length,
      accessLeaks: results.reduce((s, r) => s + r.deniedLeakCount, 0),
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
    },
    results,
    limitations: [
      'Synthetic questions are lexically close to authored policies. This is a regression fixture, not a production-quality claim.',
      'Runs use in-memory BM25, not D1 FTS5 or hosted vector search; cloud retrieval must be measured separately.',
      'No human review, semantic faithfulness, generated-answer correctness, or model TTFT is claimed.',
      'Policy families are split between dev and test; edge scenarios intentionally revisit known policies.',
    ],
  });
}
await writeFile(
  'reports/evaluations.json',
  JSON.stringify(
    { generatedAt: new Date().toISOString(), datasetHash, corpusHash: corpus.hash, runs },
    null,
    2,
  ) + '\n',
);
console.table(
  runs.map((r) => ({
    run: r.id,
    recall: r.metrics.recallAt5.toFixed(3),
    mrr: r.metrics.mrr.toFixed(3),
    ndcg: r.metrics.ndcgAt5.toFixed(3),
    accessLeaks: r.metrics.accessLeaks,
  })),
);
if (runs.some((r) => r.metrics.accessLeaks > 0)) process.exitCode = 1;
