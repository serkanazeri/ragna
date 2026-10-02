import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { compareQuality, type EvaluationReport } from '../core/quality';
const baseline = JSON.parse(
  await readFile('baselines/retrieval-v1.json', 'utf8'),
) as EvaluationReport;
const current = JSON.parse(await readFile('reports/evaluations.json', 'utf8')) as EvaluationReport;
const result = compareQuality(baseline, current);
await writeFile(
  'reports/quality-gate.json',
  JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2) + '\n',
);
const summary = [
  '## Retrieval kalite kontrolü',
  result.passed ? 'Başarılı' : 'Başarısız',
  `Tolerans: ${(result.tolerance * 100).toFixed(0)} yüzde puan · erişim sızıntısı toleransı: 0`,
  ...result.failures.map((f) => `- ${f}`),
  '',
  '| Deney | Soru | Önce recall | Sonra recall | Önce nDCG | Sonra nDCG |',
  '|---|---|---|---|---|---|',
  ...result.changes.map(
    (c) =>
      `| ${c.run} | ${c.questionId} | ${c.before ?? '—'} | ${c.after ?? '—'} | ${c.beforeNdcg ?? '—'} | ${c.afterNdcg ?? '—'} |`,
  ),
].join('\n');
await writeFile('reports/quality-gate.md', summary + '\n');
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
console.log(summary);
if (!result.passed) process.exitCode = 1;
