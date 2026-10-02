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

## v0.2 doğrulaması — 2 Ekim 2026

- 33 otomatik test: TTL, kaynak/sürüm/erişim değişimi, bilinmeyen atıf, config invalidation, yetkili cache bypass ve quota dolduğunda cache erişimi dahil.
- Gerçek yerel API: Gemma yanıtı 9.273 ms, aynı sorunun cache yanıtı 4 ms; model rezervasyon sayısı 6 → 7 → 7. Tek fonksiyonel kontrol; latency benchmark değildir.
- Türkçe arayüzde cache etiketi, üretim zamanı, sağlayıcı ve kaynak penceresi görüldü.
- Genel bakış, sohbet, değerlendirmeler, bilgi tabanı ve mühendislik notları; 320/390/768/1024/1440 px genişliklerde kontrol edildi. 25 kombinasyonda sayfa genelinde yatay taşma yoktu. Tablolar ve mobil soru kartları kendi alanlarında kaydırılabilir. Bu test fiziksel cihaz testi değildir.
- Chrome'da service worker kurulduktan sonra yerel sunucu durduruldu; sayfa yeniden yüklendiğinde uygulama arayüzü açıldı ve API erişimi için Türkçe bağlantı uyarısı gösterildi. Kullanıcının cihazına uygulama kurulmadı; Safari/iOS gerçek cihaz kurulumu ayrıca kontrol edilmelidir.
- Manifest, 192/512 px PNG ikonlar, maskable ikon, aynı origin'den Inter fontları ve versiyonlanmış static precache eklendi. API yanıtları browser cache'ine dahil edilmedi.
- Canlı Cloudflare smoke kontrolü geçti. Dört kaynaklı örnek yanıt Workers AI ile hazırlanarak cache'e alındı; yanıtlanamayan iki örnek saklanmadı. Aynı sorunun iki anonim isteği `cached` döndü, ayrı request ID üretti ve model rezervasyon sayısı 47 → 47 kaldı. Bu isteklerde model token kullanımı sıfırdı; dashboard iki cache hit gösterdi.
- Cloudflare v0.2 dağıtımı: `1f5753f7-555d-4d0b-9b65-51adbc59f346`. Manifest, service worker ve ikonlar canlıda HTTP 200 döndü. README ekran görüntüsü canlı Türkçe arayüzden yenilendi.
