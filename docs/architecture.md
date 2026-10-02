# Architecture and data contracts

## Request lifecycle

1. Validate the question and payload size. Public access is always `public`; only the server-side administration key can request `operations`.
2. Reserve the model request through a single SQLite-backed Durable Object. Public requests share a per-IP minute limit and global daily count/cost reservation.
3. Search current authorized chunks through D1 FTS5. If the verified index hash matches, embed with BGE-M3 and query Vectorize with metadata filters.
4. Fuse ranks with RRF and inspect authorization again. Up to five chunks enter the prompt.
5. Try the configured providers, with time and price bounds. Documents are explicitly untrusted input in the model prompt.
6. Parse structured output and check that citation identifiers belong to the authorized context. Reject invalid output and try the next provider.
7. Return the answer or a labeled fallback. Persist operational metadata without the raw question or answer. Telemetry failure is logged but does not discard an already produced answer.

No public parameter can select arbitrary models, inference URLs, or private data scopes. The browser receives no provider credential. Prompt instructions are an additional boundary; SQL/vector authorization is the primary data boundary.

## Content lifecycle

The canonical corpus is version-controlled JSON with `id`, `version`, `effectiveDate`, `audience`, `status`, and sections. Chunk identifiers preserve source association. `scripts/generate-data.ts` regenerates the fixture and initial SQL seed; it is a fixture-authoring tool, not a production migration manager. After an already deployed seed changes, create a new numbered migration rather than editing an applied migration and expecting it to run again.

Authenticated indexing embeds eight chunks per request, upserts vectors, and copies versioned source snapshots to a private R2 bucket. Index activation requires all expected vectors to carry the current corpus hash. New application code must never silently use an old embedding index. Unknown or unauthorized vector results are dropped again in the Worker.

R2 is an archival source snapshot in this release. Runtime source rendering uses the same bundled, versioned corpus as the evaluator. This keeps source provenance deterministic; a larger ingestion service should read content from storage and store compact chunk references in SQL.

## Failure behavior

| Failure                                    | Behavior                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Laptop off                                 | Public cloud application continues independently                          |
| Vector index not ready / embedding timeout | Lexical retrieval with an error span                                      |
| Primary model invalid / unavailable        | OpenRouter if configured                                                  |
| All model paths fail                       | Evidence excerpts with explicit mode                                      |
| Insufficient evidence                      | Model abstention or labeled retrieval-only result                         |
| Daily inference reservation exhausted      | Evidence / recorded walkthrough; no model call                            |
| D1 telemetry insert fails                  | Answer returned, structured error logged; metrics undercount acknowledged |
| Hosting/database free quota exhausted      | Request can fail; no promise of unlimited free availability               |

## Access and privacy limits

The shared administration key is for one trusted operator. It is not a multi-user identity system. Treat the operations scope as a demonstrator, not a confidential-data deployment recipe. Open WebUI always uses the public scope, even when its user calls themselves an administrator in chat.

D1 stores request UUID, timestamp, mode, provider, model, timings, token counts when available, cost when reported, citation validation, and span metadata. Raw questions and answers are not stored in the requests telemetry table. The separate answer_cache table stores validated public model answers and citations for up to 24 hours, keyed by a question/configuration hash; it never stores the raw question. Hashing does not guarantee anonymity. Provider processing is still external processing. The public dashboard exposes only operational metadata; request UUIDs serve as unguessable feedback references, not authenticated user identity. The feedback score is directional and can be manipulated by visitors.

The current table has no automatic retention purge. A production deployment needs an explicit retention policy and deletion job. Cloudflare request logging is sampled and must also be reviewed before using personal data.

## Performance decisions

Static assets are served at the edge. Retrieval does not scan external documents on each question. Embeddings are precomputed during indexing. Query providers run server-side, and each expensive path is bounded. The client has no charting framework; small accessible bars/tables display exact measurements.

The API buffers output until validation completes. Reported request duration therefore includes retrieval plus complete response validation, not first-token latency. Cloud performance must be measured separately from the sub-millisecond offline lexical function.

Hosted inference has a 12-second Workers AI and 20-second OpenRouter deadline. Local Ollama has a 45-second deadline to accommodate model loading and prefill; thinking is disabled for the bounded factual answer task. The optional Open WebUI Pipe allows 90 seconds for retrieval and the sequential provider paths.

## v0.2: yanıt cache'i ve PWA

Model rezervasyonundan önce D1 exact-match cache'i kontrol edilir. Anahtar; NFC/boşluk normalizasyonu yapılmış soru, corpus hash, public kapsam, CACHE_POLICY, route/model ve sağlayıcı yapılandırmasını kapsar. Her hit sırasında atıf metni ve kaynak sürümleri güncel public chunk'larla tekrar eşleştirilir. İç kapsam, kayıtlı örnekler, abstention ve evidence fallback saklanmaz. Geçerlilik 24 saat, kapasite 1.000 kayıttır. Cache isteği ayrı 60/dakika/IP sınırı kullanır; model rezervasyonuna yazılmaz. Yetkili değerlendirmeler cache okumasını atlayabilir; ziyaretçinin refreshCache parametresi dikkate alınmaz.

PWA sadece aynı origin'deki build dosyalarını, ikonları ve fontları precache eder. API/sohbet yanıtları tarayıcı cache'ine girmez. Sunucu cache'i ile service worker cache'i ayrı amaçlara sahiptir. Offline arayüz sunucu verisine veya yeni model üretimine erişim anlamına gelmez.
