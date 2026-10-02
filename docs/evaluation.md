# Evaluation protocol

## Reproducible baseline

`npm run evaluate` uses a fixed synthetic corpus and question set. Hashes identify inputs. The three configurations share the same questions, tokenizer, BM25 implementation, and top-5 chunk cutoff. The metric removes duplicate document IDs after the cutoff, so several chunks from one policy can reduce coverage of a multi-policy question.

- Recall@5 = retrieved reference documents / reference documents.
- MRR = inverse rank of the first reference document, or zero.
- nDCG@5 = discounted binary document relevance divided by ideal discounted relevance.
- Unanswerable questions have no positive reference documents and are excluded from these three denominators.
- Access leaks count stale documents and operations-only documents exposed to public queries.

The held-out split covers separate policy families for ordinary questions. Adversarial/temporal edge cases intentionally revisit existing families. It is not a perfect independent benchmark. Synthetic prompts may resemble the authored source language and overestimate real-user retrieval quality.

## Live retrieval

`npm run evaluate:retrieval` sends all 60 questions through the authenticated retrieval endpoint, without generation. It records full-set and holdout metrics, mode, source IDs, corpus hash, spans, and latency. Set `LEXICAL_ONLY=1` to measure the actual D1 FTS5 path. Compare this with hybrid results; do not attribute a difference between offline BM25 and hybrid solely to embeddings.

## Live generation

`npm run evaluate:live` defaults to 12 held-out questions and saves each complete response for review. `EVAL_LIMIT` is capped at 60. The provider and response mode must accompany every quality result. A fallback/recorded row cannot count as successful live generation.

Reference-term coverage is a debugging aid. It can reward a wrong statement containing the right number. Cited-document recall can reward a source that does not support the specific claim. Neither is a correctness score. Review claims against the exact retrieved passages.

## Human review rubric

For each live answer, record: correct / partially correct / incorrect; supported / partly supported / unsupported; abstention appropriate / inappropriate; citations sufficient / incomplete / wrong; and a short evidence-backed explanation. Review multilingual paraphrases, multi-policy synthesis, stale/current contradictions, unavailable facts, role claims, and source prompt injection separately.

A model judge, if added, needs human calibration, a pinned judge version and rubric, disagreement analysis, and source/answer separation. Do not have the same model generate questions, answers, and a self-approved quality score without independent review.

## Release gates

- TypeScript and unit/provider regression tests pass.
- No observed authorization or archived-source leak in fixed regression questions.
- Local and deployed HTTP smoke checks pass.
- Live answers expose the actual provider/model and trace; failure is labeled.
- Vector index hash matches the deployed corpus before hybrid is enabled.
- Secret files, real credentials, and customer data are absent from the commit.
- Model/embedding superiority and availability SLOs are not claimed without the corresponding evidence.

Improvement targets are hypotheses until measured: better held-out bilingual recall without access regressions, reasonable p95 under representative concurrent load, and high human-supported-answer rate. The initial deployment has no established production SLO.

Model abstention decisions use a fixed user-facing message instead of exposing malformed text such as `abstained:true`. A small TR/EN question-prefix heuristic selects the message language. Provider/model attribution still records the decision origin. This presentation normalization does not convert an answered question into an abstention or establish correctness.

## Cache ve canlı ölçümler

`evaluate:live` yetkili `refreshCache: true` ile yeni inference ister. Cache yanıtları model doğruluğu veya model gecikmesi olarak raporlanmamalıdır. Operasyon paneli cache yanıtlarını ayrı sayar. Cache hit için bu isteğin üretim maliyeti sıfırdır; önceki üretimin maliyeti asıl istek kaydında kalır. Corpus/configuration invalidation, TTL, erişim kapsamı ve bütçe tüketmeme davranışı regresyon testleriyle korunur.
