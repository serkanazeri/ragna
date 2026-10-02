import { describe, it, expect } from 'vitest';
import corpus from '../data/corpus.json';
import questions from '../data/questions.json';
import {
  chunkDocuments,
  lexicalSearch,
  fuseRanks,
  parseGroundedOutput,
  tokenize,
} from '../core/retrieval';
import type { SourceDocument } from '../core/types';
const chunks = chunkDocuments(corpus.documents as SourceDocument[]);
describe('retrieval access boundaries', () => {
  it('never retrieves archived or operations-only chunks for a public request', () => {
    for (const q of questions) {
      const hits = lexicalSearch(q.question, chunks, 'public', 100);
      expect(hits.every((h) => h.chunk.audience === 'public' && h.chunk.status === 'current')).toBe(
        true,
      );
    }
  });
  it('retains restricted evidence for authenticated operations queries', () => {
    expect(lexicalSearch('Bayi komisyon oranı', chunks, 'operations')[0].chunk.documentId).toBe(
      'commission',
    );
  });
  it('finds the current return policy, not the archived 14-day version', () => {
    const hits = lexicalSearch('Güncel iade süresi', chunks, 'public');
    expect(hits.some((h) => h.chunk.documentId === 'returns')).toBe(true);
    expect(hits.some((h) => h.chunk.documentId === 'returns-archive')).toBe(false);
  });
  it('normalizes Turkish dotted capital I', () =>
    expect(tokenize('İADE POLİTİKASI')).toContain('iade'));
  it('keeps provenance and enforces progress for long single words', () => {
    const docs = [
      {
        ...corpus.documents[0],
        sections: [{ heading: 'Long', text: 'x'.repeat(2000) + ' hello world' }],
      },
    ] as SourceDocument[];
    const result = chunkDocuments(docs, 10);
    expect(result.length).toBeLessThan(5);
    expect(result.every((c) => c.documentId === docs[0].id)).toBe(true);
  });
  it('rank fusion combines independent ranks without comparing incomparable scores', () => {
    const a = { chunk: chunks[0], score: 900 };
    const b = { chunk: chunks[1], score: 0.98 };
    expect(fuseRanks([a, b], [b, a])[0].score).toBeCloseTo(1 / 61 + 1 / 62);
  });
});
describe('citation validation', () => {
  const allowed = new Set(['S1', 'S2']);
  it('rejects invented identifiers inside grouped citations', () =>
    expect(
      parseGroundedOutput(
        '{"answer":"30 days [S1, S99]","citations":["S1"],"abstained":false}',
        allowed,
      ),
    ).toBeNull());
  it('rejects empty responses', () =>
    expect(
      parseGroundedOutput('{"answer":"  ","citations":["S1"],"abstained":false}', allowed),
    ).toBeNull());
  it('rejects an abstention that still claims supporting citations', () =>
    expect(
      parseGroundedOutput(
        '{"answer":"No information [S1]","citations":["S1"],"abstained":true}',
        allowed,
      ),
    ).toBeNull());
  it('rejects citations invented by the model', () =>
    expect(
      parseGroundedOutput(
        '{"answer":"30 days [S99]","citations":["S99"],"abstained":false}',
        allowed,
      ),
    ).toBeNull());
  it('rejects inline identifiers that were not declared', () =>
    expect(
      parseGroundedOutput(
        '{"answer":"30 days [S2]","citations":["S1"],"abstained":false}',
        allowed,
      ),
    ).toBeNull());
  it('rejects uncited factual answers', () =>
    expect(
      parseGroundedOutput('{"answer":"30 days","citations":[],"abstained":false}', allowed),
    ).toBeNull());
  it('allows an honest abstention', () =>
    expect(
      parseGroundedOutput('{"answer":"No evidence","citations":[],"abstained":true}', allowed)
        ?.abstained,
    ).toBe(true));
  it('does not interpret valid identifiers as semantic faithfulness', () =>
    expect(
      parseGroundedOutput(
        '{"answer":"unsupported statement [S1]","citations":["S1"],"abstained":false}',
        allowed,
      ),
    ).not.toBeNull());
});
