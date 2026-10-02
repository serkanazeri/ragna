# Mimari ve veri sözleşmeleri

## İsteğin yaşam döngüsü

1. Soru ve payload boyutu doğrulanır. Herkese açık erişim her zaman `public` kapsamındadır; yalnızca sunucu tarafındaki yönetim anahtarı `operations` kapsamını isteyebilir.
2. Uygun public isteklerde, model rezervasyonundan önce geçerli yanıt cache'i aranır. Cache hit ayrı hız sınırına tabidir; kaynaklar yeniden doğrulanır ve model çağrılmadan yanıt döndürülür.
3. Yeni model isteği, SQLite kullanan tek bir Durable Object üzerinden rezerve edilir. Herkese açık istekler IP başına dakika sınırını ve küresel günlük istek/maliyet rezervasyonunu paylaşır.
4. D1 FTS5 ile güncel ve erişim yetkisi olan chunk'lar aranır. Doğrulanmış index hash eşleşiyorsa BGE-M3 ile sorgu embedding'i üretilir ve Vectorize metadata filtreleriyle sorgulanır.
5. Sıralamalar RRF ile birleştirilir ve erişim yetkisi yeniden denetlenir. Prompt'a en fazla beş chunk eklenir.
6. Yapılandırılmış sağlayıcılar süre ve fiyat sınırları içinde denenir. Model prompt'u, belgelerin güvenilmeyen girdi olduğunu açıkça belirtir.
7. Yapılandırılmış çıktı ayrıştırılır ve atıf kimliklerinin yetkili bağlama ait olduğu denetlenir. Geçersiz çıktı reddedilir ve sıradaki sağlayıcı denenir.
8. Yanıt veya açıkça etiketlenmiş fallback döndürülür. Uygun model yanıtları ayrı yanıt cache'ine yazılır. Operasyonel metadata, ham soru veya yanıt olmadan telemetry kaydına alınır. Telemetry hatası loglanır; üretilmiş yanıtın kullanıcıya iletilmesini engellemez.

Ziyaretçi parametreleriyle keyfî model, inference URL'si veya özel veri kapsamı seçilemez. Tarayıcıya sağlayıcı kimlik bilgisi gönderilmez. Prompt talimatları ek bir sınırdır; temel veri erişim sınırını SQL ve vektör sorgularındaki yetkilendirme oluşturur.

## İçeriğin yaşam döngüsü

Asıl corpus; `id`, `version`, `effectiveDate`, `audience`, `status` ve bölüm alanlarını içeren, sürüm kontrolündeki JSON verisidir. Chunk kimlikleri kaynak bağını korur. `scripts/generate-data.ts`, test veri kümesini ve ilk SQL seed'ini yeniden üretir; bu araç production migration yönetimi için kullanılmaz. Dağıtılmış bir seed değiştiğinde, daha önce uygulanmış migration'ı düzenleyip tekrar çalışmasını beklemek yerine yeni numaralı bir migration oluşturulur.

Kimlik doğrulamalı indexleme her istekte sekiz chunk için embedding üretir, vektörleri upsert eder ve sürümlü kaynak kopyalarını özel R2 bucket'ına yazar. Index'in etkinleşmesi için beklenen tüm vektörlerin güncel corpus hash değerini taşıması gerekir. Yeni uygulama kodu eski embedding index'ini sessizce kullanmamalıdır. Bilinmeyen veya yetkisiz vektör sonuçları Worker içinde yeniden elenir.

Bu sürümde R2, kaynakların arşiv kopyalarını tutar. Çalışma anındaki kaynak görünümü, değerlendiricinin de kullandığı paketlenmiş ve sürümlü corpus'a dayanır. Böylece kaynak kökeni deterministik kalır. Daha büyük bir ingestion servisi içeriği depolamadan okumalı ve SQL'de küçük chunk referansları tutmalıdır.

## Hata durumlarında davranış

| Hata veya durum                                      | Davranış                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Bilgisayar kapalı                                    | Herkese açık bulut uygulaması bağımsız çalışmaya devam eder                                                    |
| Vektör index'i hazır değil / embedding zaman aşımı   | Hata span'iyle birlikte lexical retrieval kullanılır                                                           |
| Birincil model geçersiz çıktı veriyor / erişilemiyor | Yapılandırılmışsa OpenRouter denenir                                                                           |
| Tüm model yolları başarısız                          | Yanıt türü açıkça belirtilerek kaynak alıntıları sunulur                                                       |
| Yeterli kanıt yok                                    | Model yanıt vermekten kaçınır veya yalnızca retrieval sonucu etiketlenerek sunulur                             |
| Günlük inference rezervasyonu dolu                   | Geçerli cache yanıtı sunulabilir; diğer isteklerde kaynak alıntısı / kayıtlı örnek kullanılır, model çağrılmaz |
| D1 telemetry kaydı başarısız                         | Yanıt döndürülür, yapılandırılmış hata loglanır; metriklerin eksik sayabileceği kabul edilir                   |
| Barındırma / veritabanı ücretsiz kotası dolu         | İstek başarısız olabilir; sınırsız ücretsiz erişilebilirlik vaat edilmez                                       |

## Erişim ve gizlilik sınırları

Ortak yönetim anahtarı tek bir güvenilir operatör içindir; çok kullanıcılı kimlik sistemi değildir. `operations` kapsamı bir gösterimdir, gizli veri barındırmak için hazır bir dağıtım tasarımı değildir. Open WebUI, kullanıcı sohbette kendisini yönetici olarak tanıtsa bile her zaman public kapsamını kullanır.

D1; istek UUID'si, zaman damgası, yanıt türü, sağlayıcı, model, süreler, varsa token sayıları, bildirilmiş maliyet, atıf doğrulaması ve span metadata'sını saklar. `requests` telemetry tablosunda ham soru ve yanıt tutulmaz. Ayrı `answer_cache` tablosu, doğrulanmış public model yanıtlarını ve atıflarını soru/yapılandırma hash'iyle en fazla 24 saat geçerli olacak şekilde saklar; ham soruyu saklamaz. Hash kullanımı anonimlik garantisi değildir. Sağlayıcı tarafındaki işlem, haricî veri işleme olmaya devam eder. Herkese açık dashboard yalnızca operasyonel metadata sunar. İstek UUID'leri tahmin edilmesi güç geri bildirim referanslarıdır; kimliği doğrulanmış kullanıcı kimliği değildir. Geri bildirim skoru yön göstericidir ve ziyaretçiler tarafından manipüle edilebilir.

Mevcut telemetry tablosunda otomatik saklama süresi temizliği yoktur. Production dağıtımı için açık bir saklama politikası ve silme işi gerekir. Cloudflare istek logları örneklemeli tutulur; kişisel veri kullanılmadan önce bu ayarlar da incelenmelidir.

## Performans kararları

Statik dosyalar edge üzerinden sunulur. Retrieval her soruda dış belgeleri taramaz. Belge embedding'leri indexleme sırasında önceden hesaplanır. Sağlayıcı çağrıları sunucu tarafında çalışır ve maliyetli her yol sınırlandırılır. İstemcide grafik framework'ü yoktur; küçük ve erişilebilir çubuklar/tablolar ölçüm değerlerini gösterir.

API, doğrulama tamamlanana kadar çıktıyı buffer'da tutar. Bu nedenle raporlanan istek süresi, retrieval ile yanıtın tamamının doğrulanmasını kapsar; ilk token gecikmesi değildir. Bulut performansı, milisaniyenin altında sürebilen offline lexical fonksiyondan ayrı ölçülmelidir.

Bulut çıkarımında Workers AI için 12 saniye, OpenRouter için 20 saniye zaman aşımı uygulanır. Yerel Ollama, model yükleme ve prefill için 45 saniye bekleyebilir; sınırlı, olgusal yanıt görevi için thinking kapalıdır. İsteğe bağlı Open WebUI Pipe, retrieval ve ardışık sağlayıcı yolları için toplam 90 saniye bekler.

## v0.2: yanıt cache'i ve PWA

Model rezervasyonundan önce D1 exact-match cache'i kontrol edilir. Anahtar; NFC/boşluk normalizasyonu yapılmış soru, corpus hash, public kapsam, `CACHE_POLICY`, route/model ve sağlayıcı yapılandırmasını kapsar. Her hit sırasında atıf metni ve kaynak sürümleri güncel public chunk'larla tekrar eşleştirilir. İç kapsam, kayıtlı örnekler, abstention ve evidence fallback saklanmaz. Geçerlilik 24 saat, kapasite 1.000 kayıttır. Süresi dolmuş kayıtlar sunulmaz; fiziksel temizlik cache yazımında ve 6 saatte bir sağlık kontrolünde yapılır. Cache isteği ayrı 60/dakika/IP sınırı kullanır; model rezervasyonuna yazılmaz. Yetkili değerlendirmeler cache okumasını atlayabilir; ziyaretçinin `refreshCache` parametresi dikkate alınmaz.

PWA sadece aynı origin'deki build dosyalarını, ikonları ve fontları precache eder. API/sohbet yanıtları tarayıcı cache'ine girmez. Sunucu cache'i ile service worker cache'i ayrı amaçlara sahiptir. Çevrimdışı arayüz, sunucu verisine veya yeni model üretimine erişim anlamına gelmez.

## Kalite, inceleme ve sağlık

Offline kalite kapısı, 40 soruluk yanıt inceleme seti, periyodik gerçek model kontrolleri ve yetkili belge yayımlama akışı [kalite ve operasyon rehberinde](quality-and-operations.md) açıklanır. Model kontrolü smoke trafiğine yazılır. İnceleme puanları tarayıcıda taslaktır; genel metriklere veya yayımlanmış kalite skoruna eklenmez.
