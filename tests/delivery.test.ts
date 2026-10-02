import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareQuality, type EvaluationReport } from '../core/quality';
import baselineData from '../baselines/retrieval-v1.json';
import corpus from '../data/corpus.json';
import questions from '../data/questions.json';
import { previewContent, corpusSql } from '../core/content';
import { validReviews } from '../core/review';
import { healthStatus } from '../worker/health';
import type { SourceDocument, Question } from '../core/types';
import type { Env } from '../worker/env';
const baseline = baselineData as EvaluationReport;
describe('kalite kapısı', () => {
  it('değişmeyen sonuçları kabul eder', () =>
    expect(compareQuality(baseline, structuredClone(baseline)).passed).toBe(true));
  it('recall/nDCG düşüşünü ve değişen soruları raporlar', () => {
    const next = structuredClone(baseline);
    for (const r of next.runs[0].results) {
      if (r.recall !== null) r.recall = 0;
      if (r.ndcg !== null) r.ndcg = 0;
    }
    const result = compareQuality(baseline, next);
    expect(result.passed).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.failures.some((f) => f.includes('holdout'))).toBe(true);
  });
  it('erişim sızıntısını ortalama iyileşse bile reddeder', () => {
    const next = structuredClone(baseline);
    next.runs[0].results[0].deniedLeakCount = 1;
    expect(compareQuality(baseline, next).passed).toBe(false);
  });
  it('eksik soru, deney veya değişmiş dataset hash değerini reddeder', () => {
    for (const change of [
      (d: EvaluationReport) => d.runs.pop(),
      (d: EvaluationReport) => d.runs[0].results.pop(),
      (d: EvaluationReport) => (d.datasetHash = 'changed'),
    ]) {
      const next = structuredClone(baseline);
      change(next);
      expect(compareQuality(baseline, next).passed).toBe(false);
    }
  });
});
describe('kontrollü belge güncellemesi', () => {
  const docs = corpus.documents as SourceDocument[];
  const candidate = { ...docs[0], version: docs[0].version + 1 };
  it('sürüm artışını ve chunk önizlemesini üretir; kapsam genişlemesini reddeder', () => {
    expect(previewContent(docs, candidate, questions as Question[]).chunks.length).toBeGreaterThan(
      0,
    );
    expect(() => previewContent(docs, { ...candidate, audience: 'operations' }, [])).toThrow();
    expect(() => previewContent(docs, docs[0], [])).toThrow();
    expect(() => previewContent(docs, { ...candidate, id: '../escape' }, [])).toThrow();
    expect(() => previewContent(docs, { ...candidate, effectiveDate: '2026-02-31' }, [])).toThrow();
  });
  it('SQL metnini kaçar ve vektör aktivasyonunu geçersizleştirir', () => {
    const sql = corpusSql([{ ...candidate, title: "Aster'ın politikası" }]);
    expect(sql).toContain("Aster''ın politikası");
    expect(sql).toContain("DELETE FROM config WHERE key='vector_corpus_hash'");
  });
  it('CLI önizleme ve uygulama akışını izole dizinde tamamlar; eski öneriyi tekrar uygulamaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ragna-content-test-'));
    try {
      mkdirSync(join(dir, 'data/sources'), { recursive: true });
      mkdirSync(join(dir, 'migrations'));
      writeFileSync(join(dir, 'data/corpus.json'), JSON.stringify(corpus));
      writeFileSync(join(dir, 'data/questions.json'), JSON.stringify(questions));
      writeFileSync(join(dir, 'migrations/0005_health.sql'), '-- fixture');
      writeFileSync(join(dir, 'candidate.json'), JSON.stringify(candidate));
      const run = (...args: string[]) =>
        spawnSync(
          process.execPath,
          ['--import', import.meta.resolve('tsx'), resolve('scripts/content.ts'), ...args],
          { cwd: dir, encoding: 'utf8' },
        );
      const preview = run('preview', 'candidate.json');
      expect(preview.status, preview.stderr).toBe(0);
      const apply = run('apply');
      expect(apply.status, apply.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, 'data/corpus.json'), 'utf8')).hash).not.toBe(
        corpus.hash,
      );
      expect(readdirSync(join(dir, 'migrations'))).toContain('0006_content_returns.sql');
      expect(run('apply').status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
describe('inceleme kökeni', () => {
  it('eski corpus/yanıt ve geçersiz incelemeleri saymaz', () => {
    const record = {
      questionId: 'q',
      requestId: 'r',
      corpusHash: 'h',
      reviewer: 'Test',
      correctness: 'correct',
      support: 'supported',
      abstention: 'appropriate',
      citations: 'sufficient',
      note: 'Kaynak pasajı iddiayı destekliyor.',
      reviewedAt: new Date().toISOString(),
    };
    const answers = [{ questionId: 'q', answer: { requestId: 'r' } }];
    expect(validReviews([record], 'h', answers)).toHaveLength(1);
    expect(validReviews([record], 'new', answers)).toHaveLength(0);
    expect(validReviews([{ ...record, requestId: 'old' }], 'h', answers)).toHaveLength(0);
    expect(validReviews([{ ...record, note: '' }], 'h', answers)).toHaveLength(0);
  });
});
describe('sağlık kontrolü', () => {
  const env = (hours: number, status = 'ok') =>
    ({
      DB: {
        prepare: (sql: string) => ({
          first: async () =>
            sql.includes('health_checks')
              ? { checked_at: new Date(Date.now() - hours * 3600000).toISOString(), status }
              : { ok: 1 },
          bind: () => ({ all: async () => ({ results: [] }) }),
        }),
      },
    }) as unknown as Env;
  it('yeni başarılı ölçümü sağlıklı, eski ölçümü güncel değil gösterir', async () => {
    expect((await healthStatus(env(1))).inference.status).toBe('ok');
    expect((await healthStatus(env(10))).inference.status).toBe('stale');
    expect((await healthStatus(env(1, 'error'))).inference.status).toBe('error');
  });
  it('veritabanı hatasını sağlıklı olarak sunmaz', async () => {
    expect(
      (
        await healthStatus({
          DB: {
            prepare: () => {
              throw new Error('offline');
            },
          },
        } as unknown as Env)
      ).api,
    ).toBe('error');
  });
});
