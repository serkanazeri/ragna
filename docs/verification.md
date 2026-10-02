# Initial release verification — 2 October 2026

| Check                           | Evidence                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript and production build | `npm run build` passed                                                                                                         |
| Regression tests                | Retrieval authorization/versioning, citation validation, provider fallback, context ceiling, serialized budgets                |
| Offline evaluation              | 60 questions × 3 chunk configurations; committed raw results                                                                   |
| Cloud retrieval                 | 60 FTS5 requests and 60 hybrid requests; 61.4% → 95.4% Recall@5 on this synthetic fixture                                      |
| Live generation                 | 24/24 requests reached Workers AI; source/response details in generation baseline                                              |
| Targeted fixes                  | English answers and abstention decisions checked in 5 explicit regressions; no generalization claim                            |
| Vector activation               | All 51 vectors verified with matching corpus hash; API verification batches respect the 20-ID limit                            |
| Synthetic generation            | Local `gemma4:12b-mlx` produced 3 candidates with exact evidence quotes; pending human review                                  |
| Open WebUI                      | Pinned v0.11.1 container healthy; Pipe invoked inside the container against the real API and emitted answer, citations, status |
| Browser                         | Desktop overview/evaluation and recorded-answer flow; 390px mobile layout had no horizontal document overflow                  |
| OpenRouter                      | Provider adapter/fallback covered with contract tests; live credit-backed route awaits an operator API key                     |

The Open WebUI first administrator account is intentionally left for the operator. Its OpenAI-compatible connection is configured by Compose; the optional native citation Pipe can be imported through the admin interface.

The container-to-host integration also passed real model discovery, local `gemma4:12b-mlx` inference, and buffered OpenAI-compatible SSE completion. The checked Turkish returns question produced a cited 30-day answer in 5.16 seconds. The initial 12-second local call timed out; disabling thinking and allowing a 45-second local deadline resolved the observed failure. This is a single functional check, not a latency benchmark.

The first published commit passed GitHub Actions (`Verify`, run `36994656588`), including clean dependency installation, formatting, build, regression tests, and offline evaluation.

Cloudflare model output has a newer OpenAI-style `choices` envelope. The initial integration run exposed this mismatch; the adapter and its regression test now cover that envelope. Test failures remain visible in the operational dashboard's 24-hour window. They are not deleted to improve the displayed success rate.

The initial generation run exposed a stock paraphrase retrieval miss, Turkish responses to English questions, and abstention flag/text mismatches. Subsequent changes improved the observed cases. Fixed abstention presentation avoids showing raw protocol text. Semantic answer correctness has not been human-scored.
