import type { Audience, Chunk, Hit, SourceDocument } from './types';

const stopWords = new Set([
  've',
  'bir',
  'bu',
  'için',
  'ile',
  'ne',
  'nedir',
  'nasıl',
  'kaç',
  'hangi',
  'mi',
  'mı',
  'mu',
  'mü',
  'the',
  'is',
  'a',
  'an',
  'of',
  'to',
  'in',
  'what',
  'how',
  'can',
  'i',
]);
export const tokenize = (text: string) =>
  text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
// Conservative, portable estimate only. Actual provider usage is recorded separately.
export const estimateTokens = (text: string) => Math.ceil(text.length / 3);
export function chunkDocuments(
  documents: SourceDocument[],
  maxTokens = 450,
  strategy = 'sections',
): Chunk[] {
  return documents.flatMap((doc) => {
    const sections =
      strategy === 'fixed'
        ? [{ heading: 'Full document', text: doc.sections.map((s) => s.text).join('\n') }]
        : doc.sections;
    return sections.flatMap((s, sectionIndex) => {
      const words = s.text.split(/\s+/);
      const windows: string[] = [];
      let current = '';
      let start = 0;
      while (start < words.length) {
        let end = start;
        current = '';
        while (
          end < words.length &&
          (estimateTokens(current + ' ' + words[end]) <= maxTokens || end === start)
        )
          current += (current ? ' ' : '') + words[end++];
        windows.push(current);
        if (end === words.length) break;
        // 10% overlap; never crosses the section boundary or prevents progress.
        start = Math.max(start + 1, end - Math.floor((end - start) * 0.1));
      }
      return windows.map((text, i) => ({
        id: `${doc.id}-${sectionIndex}-${i}`,
        documentId: doc.id,
        title: doc.title,
        heading: s.heading,
        text,
        audience: doc.audience,
        status: doc.status,
        version: doc.version,
        effectiveDate: doc.effectiveDate,
        tokens: estimateTokens(text),
      }));
    });
  });
}
export const permitted = (chunk: Chunk, audience: Audience) =>
  chunk.status === 'current' && (chunk.audience === 'public' || audience === 'operations');
export function lexicalSearch(
  question: string,
  chunks: Chunk[],
  audience: Audience,
  k = 20,
): Hit[] {
  const docs = chunks.filter((c) => permitted(c, audience));
  const q = [...new Set(tokenize(question))];
  const tokenized = docs.map((c) => tokenize(c.title + ' ' + c.heading + ' ' + c.text));
  const avgLength = tokenized.reduce((s, t) => s + t.length, 0) / Math.max(1, docs.length);
  const frequencies = new Map<string, number>();
  for (const tokens of tokenized)
    for (const token of new Set(tokens)) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  return docs
    .map((chunk, i) => {
      const ts = tokenized[i];
      let score = 0;
      for (const t of q) {
        const tf = ts.filter((x) => x === t).length;
        if (!tf) continue;
        const idf = Math.log(
          1 + (docs.length - (frequencies.get(t) || 0) + 0.5) / ((frequencies.get(t) || 0) + 0.5),
        );
        score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * ts.length) / (avgLength || 1)));
      }
      return { chunk, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, k)
    .map((h, i) => ({ ...h, lexicalRank: i + 1 }));
}
export function fuseRanks(lexical: Hit[], vector: Hit[], k = 5): Hit[] {
  const result = new Map<string, Hit>();
  for (const [kind, hits] of [
    ['lexical', lexical],
    ['vector', vector],
  ] as const)
    hits.forEach((h, i) => {
      const prev = result.get(h.chunk.id) || { ...h, score: 0 };
      prev.score += 1 / (60 + i + 1);
      if (kind === 'lexical') prev.lexicalRank = i + 1;
      else prev.vectorRank = i + 1;
      result.set(h.chunk.id, prev);
    });
  return [...result.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
export function evidencePreview(hits: Hit[]): string {
  if (!hits.length)
    return 'Bu soruyu yanıtlamak için erişilebilir kaynaklarda yeterli kanıt bulamadım.';
  return hits
    .slice(0, 3)
    .map((h, i) => `[S${i + 1}] ${h.chunk.text}`)
    .join('\n\n');
}
export function abstentionMessage(question: string): string {
  // Lightweight TR/EN presentation heuristic, not a language-detection quality claim.
  const english =
    /^(what|when|where|why|how|is|are|can|could|does|do|please|tell|show|give)\b/i.test(
      question.trim(),
    );
  return english
    ? "I can't answer this question from the retrieved sources."
    : 'Bu soruyu bulunan kaynaklara dayanarak yanıtlayamıyorum.';
}

export function parseGroundedOutput(
  raw: string,
  allowed: Set<string>,
): { answer: string; citations: string[]; abstained: boolean } | null {
  try {
    const parsed = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, ''),
    );
    if (
      typeof parsed.answer !== 'string' ||
      !parsed.answer.trim() ||
      parsed.answer.length > 10000 ||
      !Array.isArray(parsed.citations) ||
      typeof parsed.abstained !== 'boolean'
    )
      return null;
    if (!parsed.citations.every((c: unknown) => typeof c === 'string' && allowed.has(c)))
      return null;
    if (!parsed.abstained && !parsed.citations.length) return null;
    if (parsed.abstained && parsed.citations.length) return null;
    const inline = [...parsed.answer.matchAll(/\[([^\]]+)\]/g)].flatMap(
      (m: RegExpMatchArray) => m[1].match(/\bS\d+\b/g) || [],
    );
    if (inline.some((c: string) => !allowed.has(c) || !parsed.citations.includes(c))) return null;
    return {
      answer: parsed.answer,
      citations: [...new Set<string>(parsed.citations)],
      abstained: parsed.abstained,
    };
  } catch {
    return null;
  }
}
