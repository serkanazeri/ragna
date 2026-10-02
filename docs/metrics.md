# Dashboard metrik sözleşmesi

## Zaman aralığı ve trafik kaynağı

Dashboard varsayılan olarak **Ziyaretçiler** filtresini açar. API'de `/api/metrics?traffic=visitor` kullanılır; parametre verilmezse geriye uyumluluk için tüm trafik döner. Son 24 saat sorgulanır. Filtre SQL'de limitten önce uygulanır. Seçili grubun en yeni 1.000 kaydı ölçülür; daha fazlası varsa örneklemin kesildiği açıkça belirtilir. Trafik gruplarının üstteki sayıları tüm pencereye, süreler ve oranlar seçili örnekleme aittir. Telemetry yazımı sorgular arasında gerçekleşirse sayılar kısa süreli farklılaşabilir.

| Kaynak                    | Atama                                                           |
| ------------------------- | --------------------------------------------------------------- |
| Ziyaretçiler              | Kimliği doğrulanmamış API istekleri; insan/bot ayrımı değildir  |
| Operatör / Open WebUI     | Yetkili, test etiketi bulunmayan istekler                       |
| Değerlendirme             | Yetkili `X-Ragna-Traffic: evaluation`                           |
| Smoke test                | Yetkili `X-Ragna-Traffic: smoke`                                |
| Cache hazırlığı           | Yetkili `X-Ragna-Traffic: warmup`                               |
| Eski / sınıflandırılmamış | Migration öncesi kayıtlar; geçmiş trafik kaynağı tahmin edilmez |

Yetkisiz istemcinin gönderdiği trafik etiketi dikkate alınmaz. `evaluate:live`, `test:smoke` ve `cache:warm` uygun başlığı gönderir. Smoke kontrolü artık `RAGNA_API_KEY` gerektirir; anonim kaynak erişim sınırlarını ayrıca kontrol eder. Retrieval değerlendirme endpoint'i sohbet telemetry'sine yazılmaz; bu panel retrieval benchmark isteklerini saymaz.

## Süreler

- **Yanıt türleri:** `live`, `cached`, `guided`, `evidence`, `abstained` ayrı ölçülür. `live` başarılı model yanıtıdır; modelin yanıt vermekten kaçınması `abstained` grubundadır. Bu ikinci grupta model çağrılmadan verilmiş kararlar da bulunabilir.
- **Toplam süre:** uygulama içindeki işlem süresi. İstemci ağ süresi, yanıt cache'ine yazma ve telemetry yazma süresi dahil değildir.
- **Retrieval:** gerçek arama çalıştırılan isteklerin `retrieval_ms` değeri. Cache hit, kayıtlı örnek ve guided olarak istenen çağrılar dışlanır.
- **Generation:** bir istek içindeki Workers AI, Ollama ve OpenRouter deneme span'lerinin toplamı. Hatalı denemeler, fallback ve çıktı doğrulaması dahildir. Model TTFT ölçümü değildir.
- **p50/p95:** geçerli, sonlu, sıfır veya pozitif sürelerde nearest-rank yöntemi. Eksik/bozuk değerler örnekleme dahil edilmez. Boş örneklem `null` / `—` döner; sıfır gecikme iddia edilmez. `n` geçerli süre sayısıdır. Aşama percentile değerleri toplanamaz.

API'deki eski `p50Ms` / `p95Ms` alanları geriye uyum için toplam karma örneklemi döndürür; yeni arayüz bu alanları göstermez. Ayrıştırılmış ölçümler `latencyByMode`, `stages` ve `providers` alanlarındadır.

## Sağlayıcı ve fallback

Sağlayıcı metrikleri son yanıt sağlayıcısından türetilmez; gerçek deneme span'lerini sayar. `skipped` span'leri dahil edilmez.

- Hata oranı = hatalı denemeler / sağlayıcının tüm denemeleri. Bağlantı hatası ve geçersiz JSON/atıf da hatadır.
- Timeout oranı = zaman aşımına uğrayan denemeler / tüm denemeler. Timeout, hata sayısının alt kümesidir; ayrıca toplanmaz.
- Sonraki sağlayıcıya geçiş = bu sağlayıcı hata verdikten sonra gerçekten başka sağlayıcı denenmiş istekler / bu sağlayıcının denemeleri.
- Sağlayıcı hatası görülen istek = en az bir model denemesi hatalı istek / en az bir model denemesi olan istek. Kotası dolduğu için model çağrılmayan istek bu paydaya girmez.
- Kurtarılan istek = hata görülmesine rağmen son sağlayıcı denemesi başarılı olan istek. Başarı, çıktı sözleşmesini doğrular; anlamsal doğruluğu kanıtlamaz.

Yeni timeout kayıtları yapılandırılmış `errorKind` taşır. Eski kayıtlarda bilinen timeout hata metinleri kullanılır; eksik telemetry'den kesin hata sınıfı üretilemez.

## Cache, maliyet ve geri bildirim

Cache hit oranı, kayıtlı örnek/guided dışındaki isteklerde cache yanıtlarının payıdır; her istek mutlaka cache'e uygun public kapsamda değildir. Pay ve payda panelde gösterilir. Cache istekleri retrieval/generation sürelerine sıfır olarak eklenmez.

Bildirilen maliyet, son model sonucunda maliyet alanı bulunan kayıtların toplamıdır. Kapsama oranı, maliyeti bilinen model sonuçları / model sonucu bulunan inference kayıtlarıdır. Cache'in sıfır maliyeti bu kapsama oranını yükseltmez. Önceki başarısız sağlayıcı denemelerinin maliyeti bilinmeyebilir; bu toplam hesap faturası değildir.

Günlük bütçe ve istek rezervasyonu tüm trafiği kapsar; trafik filtresiyle değişmez ve panelde açıkça etiketlenir. Olumlu geri bildirim oranının paydası yalnızca geçerli olumlu/olumsuz oy verilen kayıtlardır.

## Kapsam sınırı

Bu panel `requests` tablosuna başarıyla yazılmış sohbet sonuçlarını gösterir. Telemetry yazım hataları, API girişinde reddedilen istekler ve Worker'ın sonuç üretmeden çöktüğü durumlar burada sayılmaz. Toplam HTTP hata oranı veya uptime iddiası için platform metrikleri ve dış erişim ölçümü gerekir. Ham sorular ve yanıtlar genel telemetry'ye eklenmez.
