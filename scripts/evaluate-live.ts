import { writeFile } from 'node:fs/promises';
import questions from '../data/questions.json';
import type { ChatResponse } from '../core/types';
import { loadSecrets } from './env';
await loadSecrets();
const base = process.env.RAGNA_URL || 'http://127.0.0.1:8787';
if (!process.env.RAGNA_API_KEY)
  throw new Error('Configure RAGNA_API_KEY in .dev.vars before running live evaluation.');
const limit = Math.min(60, Number(process.env.EVAL_LIMIT || 12));
const results = [];
const ids = process.env.EVAL_IDS?.split(',');
for (const q of questions
  .filter((q) => (ids ? ids.includes(q.id) : q.split === 'test'))
  .slice(0, limit)) {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ragna-Traffic': 'evaluation',
      Authorization: `Bearer ${process.env.RAGNA_API_KEY}`,
    },
    body: JSON.stringify({ question: q.question, refreshCache: true }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Evaluation request failed: ${response.status}`);
  const answer = (await response.json()) as ChatResponse;
  results.push({
    questionId: q.id,
    category: q.category,
    mode: answer.mode,
    provider: answer.provider,
    model: answer.model,
    durationMs: answer.durationMs,
    retrievalMode: answer.retrievalMode,
    abstentionMatchesReference: (answer.mode === 'abstained') === q.shouldAbstain,
    referenceTermCoverage: q.expectedTerms.length
      ? q.expectedTerms.filter((t) =>
          answer.answer.toLocaleLowerCase('tr').includes(t.toLocaleLowerCase('tr')),
        ).length / q.expectedTerms.length
      : null,
    evidenceRecall: q.evidence.length
      ? q.evidence.filter((id) => answer.citations.some((c) => c.documentId === id)).length /
        q.evidence.length
      : null,
    answer,
  });
  console.log(`${q.id}: ${answer.mode} / ${answer.provider}`);
  // Stay below the authenticated 30/minute guard even for fast recorded responses.
  await new Promise((resolve) => setTimeout(resolve, 2100));
}
const path = `reports/live-${Date.now()}.json`;
await writeFile(
  path,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      base,
      selection: ids ? 'targeted-regression' : 'test-split',
      results,
      limitations: [
        'Term coverage is a diagnostic, not semantic correctness.',
        'Evidence/guided fallback rows are excluded from live generation quality conclusions.',
        'Human review and calibrated model-judge scores are not available.',
      ],
    },
    null,
    2,
  ),
);
console.log(
  `Saved ${path}; ${results.filter((r) => r.mode === 'live').length}/${results.length} live answers.`,
);
