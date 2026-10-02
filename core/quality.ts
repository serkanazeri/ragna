import type { EvalRun } from './types';
export type EvaluationReport = { datasetHash: string; corpusHash: string; runs: EvalRun[] };
const average = (rows: EvalRun['results'], key: 'recall' | 'ndcg') => {
  const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
};
export function compareQuality(
  baseline: EvaluationReport,
  current: EvaluationReport,
  tolerance = 0.02,
) {
  const failures: string[] = [];
  const changes: {
    run: string;
    questionId: string;
    before: number | null;
    after: number | null;
    beforeNdcg: number | null;
    afterNdcg: number | null;
  }[] = [];
  const summaries: {
    run: string;
    recallDelta: number;
    ndcgDelta: number;
    holdoutRecallDelta: number;
    holdoutNdcgDelta: number;
  }[] = [];
  if (baseline.datasetHash !== current.datasetHash)
    failures.push(
      'Soru kümesi değişti; baseline karşılaştırması için açık bir yeniden değerlendirme gerekli.',
    );
  if (
    baseline.runs.length !== current.runs.length ||
    new Set(current.runs.map((r) => r.id)).size !== current.runs.length
  )
    failures.push('Deney yapılandırmaları eksik veya tekrarlı.');
  for (const before of baseline.runs) {
    const after = current.runs.find((r) => r.id === before.id);
    if (!after) {
      failures.push(`Deney eksik: ${before.id}`);
      continue;
    }
    const expected = new Set(before.results.map((r) => r.questionId));
    if (
      after.results.length !== before.results.length ||
      new Set(after.results.map((r) => r.questionId)).size !== expected.size ||
      after.results.some((r) => !expected.has(r.questionId))
    )
      failures.push(`Soru kapsamı değişti: ${before.id}`);
    if (after.results.some((r) => r.deniedLeakCount > 0) || after.metrics.accessLeaks > 0)
      failures.push(`Erişim sızıntısı: ${after.id}`);
    for (const r of after.results) {
      const old = before.results.find((q) => q.questionId === r.questionId);
      if (!old) continue;
      if (
        r.split !== old.split ||
        (r.recall === null) !== (old.recall === null) ||
        (r.ndcg === null) !== (old.ndcg === null) ||
        [r.recall, r.ndcg].some((v) => v !== null && (!Number.isFinite(v) || v < 0 || v > 1))
      )
        failures.push(`Geçersiz soru metriği veya split: ${after.id}/${r.questionId}`);
      if (r.recall !== old.recall || r.ndcg !== old.ndcg)
        changes.push({
          run: after.id,
          questionId: r.questionId,
          before: old.recall,
          after: r.recall,
          beforeNdcg: old.ndcg,
          afterNdcg: r.ndcg,
        });
    }
    const delta = {
      run: after.id,
      recallDelta: average(after.results, 'recall') - average(before.results, 'recall'),
      ndcgDelta: average(after.results, 'ndcg') - average(before.results, 'ndcg'),
      holdoutRecallDelta:
        average(
          after.results.filter((r) => r.split === 'test'),
          'recall',
        ) -
        average(
          before.results.filter((r) => r.split === 'test'),
          'recall',
        ),
      holdoutNdcgDelta:
        average(
          after.results.filter((r) => r.split === 'test'),
          'ndcg',
        ) -
        average(
          before.results.filter((r) => r.split === 'test'),
          'ndcg',
        ),
    };
    summaries.push(delta);
    for (const key of [
      'recallDelta',
      'ndcgDelta',
      'holdoutRecallDelta',
      'holdoutNdcgDelta',
    ] as const)
      if (!Number.isFinite(delta[key]) || delta[key] < -tolerance - 1e-9)
        failures.push(`${after.id}: ${key} toleransın altında (${delta[key]}).`);
  }
  return {
    passed: failures.length === 0,
    tolerance,
    failures,
    summaries,
    changes,
    datasetHash: current.datasetHash,
    baselineCorpusHash: baseline.corpusHash,
    corpusHash: current.corpusHash,
  };
}
