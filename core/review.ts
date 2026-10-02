import { z } from 'zod';
export const reviewSchema = z
  .object({
    questionId: z.string(),
    requestId: z.string(),
    corpusHash: z.string(),
    reviewer: z.string().trim().min(2).max(80),
    correctness: z.enum(['correct', 'partial', 'incorrect']),
    support: z.enum(['supported', 'partial', 'unsupported']),
    abstention: z.enum(['appropriate', 'inappropriate']),
    citations: z.enum(['sufficient', 'incomplete', 'wrong']),
    note: z.string().trim().min(10).max(2000),
    reviewedAt: z.string().datetime(),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;
export function validReviews(
  raw: unknown,
  corpusHash: string,
  answers: { questionId: string; answer: { requestId: string } }[],
) {
  if (!Array.isArray(raw)) return [];
  const valid: Review[] = [];
  for (const value of raw) {
    const r = reviewSchema.safeParse(value);
    if (
      r.success &&
      r.data.corpusHash === corpusHash &&
      answers.some(
        (a) => a.questionId === r.data.questionId && a.answer.requestId === r.data.requestId,
      )
    ) {
      const index = valid.findIndex((v) => v.questionId === r.data.questionId);
      if (index >= 0) valid.splice(index, 1);
      valid.push(r.data);
    }
  }
  return valid;
}
