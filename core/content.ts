import { z } from 'zod';
import { chunkDocuments, lexicalSearch } from './retrieval';
import type { SourceDocument, Question } from './types';
export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/),
    title: z.string().min(3).max(160),
    department: z.string().min(1).max(80),
    language: z.enum(['tr', 'en']),
    audience: z.enum(['public', 'operations']),
    version: z.number().int().positive(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
    status: z.enum(['current', 'archived']),
    provenance: z.literal('synthetic'),
    sections: z
      .array(
        z
          .object({ heading: z.string().min(1).max(160), text: z.string().min(10).max(20000) })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export function previewContent(documents: SourceDocument[], input: unknown, questions: Question[]) {
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Belge biçimi geçersiz. Kontrol edilecek alanlar: ${parsed.error.issues.map((issue) => issue.path.join('.') || 'belge').join(', ')}`,
    );
  const candidate = parsed.data as SourceDocument;
  if (new TextEncoder().encode(JSON.stringify(candidate)).length > 100000)
    throw new Error('Belge 100 KB sınırını aşıyor.');
  const previous = documents.find((d) => d.id === candidate.id);
  if (!previous)
    throw new Error('Bu sürüm yalnızca mevcut sentetik belgelerin güncellenmesini destekler.');
  if (candidate.version <= previous.version)
    throw new Error('Belge sürümü mevcut sürümden büyük olmalı.');
  if (candidate.audience !== previous.audience)
    throw new Error('Bu akışta erişim kapsamı değiştirilemez.');
  if (candidate.effectiveDate < previous.effectiveDate)
    throw new Error('Geçerlilik tarihi geriye alınamaz.');
  const next = documents.map((d) => (d.id === candidate.id ? candidate : d));
  const before = chunkDocuments(documents),
    after = chunkDocuments(next);
  const regressions = questions
    .map((q) => {
      const ids = (chunks: typeof before) => [
        ...new Set(lexicalSearch(q.question, chunks, q.audience, 5).map((h) => h.chunk.documentId)),
      ];
      const a = ids(before),
        b = ids(after);
      const recall = (v: string[]) =>
        q.evidence.length
          ? q.evidence.filter((id) => v.includes(id)).length / q.evidence.length
          : null;
      return { questionId: q.id, before: recall(a), after: recall(b) };
    })
    .filter((r) => r.before !== r.after);
  return {
    candidate,
    documents: next,
    previousVersion: previous.version,
    chunks: after.filter((c) => c.documentId === candidate.id),
    beforeChunkCount: before.filter((c) => c.documentId === candidate.id).length,
    regressions,
    affectedQuestions: questions
      .filter((q) => q.evidence.includes(candidate.id))
      .map((q) => ({ id: q.id, question: q.question, referenceAnswer: q.referenceAnswer })),
    warning:
      'Retrieval kontrolü anlamsal doğruluğu kanıtlamaz. Etkilenen referans yanıtlar ayrıca incelenmelidir.',
  };
}
export function corpusSql(documents: SourceDocument[]) {
  const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
  let sql =
    "-- Sürümlü corpus güncellemesi; npm run content:apply tarafından üretildi.\nDELETE FROM chunks_fts;\nDELETE FROM chunks;\nDELETE FROM config WHERE key='vector_corpus_hash';\n";
  for (const c of chunkDocuments(documents)) {
    sql += `INSERT INTO chunks(id,document_id,title,heading,body,audience,status,version,effective_date) VALUES(${[c.id, c.documentId, c.title, c.heading, c.text, c.audience, c.status].map(quote).join(',')},${c.version},${quote(c.effectiveDate)});\n`;
    sql += `INSERT INTO chunks_fts(id,title,heading,body) VALUES(${[c.id, c.title, c.heading, c.text].map(quote).join(',')});\n`;
  }
  return sql;
}
