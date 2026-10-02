# Kalite ve operasyon iş akışları

## Metrikler: aynı paydaları karşılaştırmak

Dashboard varsayılan olarak ziyaretçi trafiğini gösterir. Operatör, değerlendirme, smoke ve cache hazırlığı ayrı gruplardır. Eski kayıtların kaynağı tahmin edilmez. Canlı, cache, kayıtlı örnek, kaynak alıntısı ve abstention sürelerinin her biri kendi örnek sayısı ve p50/p95 değeriyle gösterilir. [Tam ölçüm sözleşmesi](metrics.md).

## Yanıt inceleme

`data/review-set.json`, mevcut sentetik benchmark'tan seçilen 40 Türkçe/İngilizce soru içerir. Altı senaryo türünü kapsar. Bu set bağımsız bir kör test veya insan onaylı gold set değildir. `reports/review-candidates.json` gerçek API yanıtlarını, atıfları, request ID'lerini ve toplama zamanlarını saklar. Fallback ve kaçınma sonuçları da incelenir; başarısız örnekler gizlenmez.

```bash
RAGNA_URL=https://your-worker.workers.dev npm run review:collect
```

Komut `.dev.vars` içindeki operatör anahtarını kullanır, cache'i atlar ve trafiği `evaluation` olarak etiketler. Önceki kayıtlarla aynı corpus hash varsa eksik sorulardan devam eder; `-- --refresh` tüm seti yeniden toplar. Günlük kota korunur; quota dolduğunda mevcut sonuçları saklayıp durur. Farklı tarihlerde toplanmış kayıtlar eş koşullu model karşılaştırması değildir.

**Yanıt inceleme** ekranında referans taslağı, sistem yanıtı ve kaynaklar birlikte gösterilir. Doğruluk, kaynak desteği, yanıt verme/kaçınma kararı ve atıflar puanlanır. Kanıt notu zorunludur. Taslaklar yalnızca kullanılan tarayıcıda saklanır ve JSON olarak indirilebilir; sunucuya gönderilmez. Corpus hash veya request ID eşleşmeyen puanlar geçerli sayılmaz. Canlı corpus doğrulanamazsa puan kaydı kapalıdır.

İnsan incelemesi yapılmadan inceleme sayısı veya anlamsal kalite oranı üretilmez. Otomatik testlerin geçmesi, yanıtın anlamsal doğruluğunu kanıtlamaz.

## CI kalite kapısı

```bash
npm run check
```

Sıra: offline retrieval değerlendirmesi → kalite kapısı → TypeScript/build/PWA → regresyon testleri. `Verify` workflow ayrıca temiz bağımlılık kurulumu ve biçim kontrolünü çalıştırır.

- Baseline: `baselines/retrieval-v1.json`; güncel sonuç: `reports/evaluations.json`.
- Aynı dataset hash, koşu ve soru kapsamı gerekir; kayıp sonuç başarısızlıktır.
- Global ve test split Recall@5/nDCG@5 düşüş toleransı **0,02 mutlak değer**, yani **2 yüzde puanı**dır. Bu bir istatistiksel güven aralığı değildir.
- Her erişim sızıntısı başarısızlıktır; ortalama kalite artışı bunu telafi etmez.
- Değişen sorular ve metrik farkları JSON/Markdown raporuna yazılır. Başarılı veya başarısız workflow bu raporu artifact olarak saklar.

Baseline otomatik olarak güncellenmez. Dataset değiştiğinde karşılaştırma bilinçli olarak durur; yeni baseline gerekçesi kod incelemesinde belirtilmelidir. Bu kapı yerel lexical retrieval regresyonlarını izler; canlı hybrid retrieval veya model anlamsal kalitesi için ayrı değerlendirme gerekir.

## API ve model sağlığı

- `GET /api/health`: D1 erişimi, son model kontrolü ve son 7 gündeki kontrol sayıları.
- Cloudflare Cron: 6 saatte bir gerçek, cache dışı model çağrısı. `smoke` trafiğine yazılır; ziyaretçi metriklerine girmez.
- Başarı: gerçek `live` yanıt, doğrulanmış atıf ve kullanılan kaynak. Anlamsal doğruluk iddiası değildir.
- 9 saatten eski son kontrol `stale`; hiç kontrol yoksa `unknown` görünür.
- GitHub **Demo erişilebilirliği**: 2 saatte bir dışarıdan arayüz, health ve PWA manifest kontrolü; push ve manuel tetikleme de desteklenir. Başarısız kontrol workflow'u başarısız yapar. Bildirim teslimi kullanıcının GitHub Actions bildirim tercihine bağlıdır.
- Günlük model kotası ve bütçesi kontrol çağrılarına da uygulanır. Normal koşulda günde 4 planlı model çağrısı eklenir. Kota biterse izleme bunu başarılı göstermez.
- Health kayıtları 14 gün saklanır. Süresi dolan sunucu cache kayıtları periyodik kontrolde ve sonraki cache yazımında temizlenir.

Periyodik örnekler kesintisiz uptime oranı veya production SLO değildir. Scheduler gecikmeleri, iki kontrol arasındaki kesintiler ve HTTP isteği dışındaki kullanıcı deneyimi ayrıca değerlendirilmelidir.

```bash
RAGNA_URL=https://your-worker.workers.dev npm run health:check
RAGNA_URL=https://your-worker.workers.dev npm run monitor
```

İlk komut operatör anahtarıyla anlık gerçek model kontrolü başlatır. İkincisi secret gerektirmeyen dış kontroldür.

## Kontrollü belge güncellemesi

Bu sürüm mevcut sentetik belgelerin sürümlü güncellenmesini destekler. Genel ziyaretçi canlı corpus'u değiştiremez. **Belge iş akışı** ekranı açık kaynakları getirir, JSON doğrulaması ve chunk önizlemesini tarayıcıda yapar. İndirilen öneri temel corpus hash'ini taşır. Erişim kapsamı değişikliği, geriye giden tarih, geçersiz belge kimliği ve artmayan sürüm reddedilir.

```bash
npm run content:preview -- öneri.json
npm run content:apply
npm run content:publish
```

1. `preview`: `.ragna/preview.json` içinde tüm corpus üzerinde retrieval değişimlerini ve etkilenen referans yanıtları listeler. Tarayıcı önizlemesi yalnızca seçili belgenin chunk'larını hesaplar.
2. `apply`: aynı temel hash'i yeniden doğrular, soru bazında recall gerilemesi varsa durur; yeni corpus hash, Markdown kaynağı ve numaralı D1 migration üretir. Önceki corpus `.ragna/corpus-before.json` dosyasında saklanır. Benchmark'ın referans yanıtları otomatik değiştirilmez.
3. `publish`: biçim ve kalite kontrolü, uzak D1 migration, Worker dağıtımı, vektör index doğrulaması, smoke ve gerçek model sağlık kontrolünü sırayla çalıştırır. İlerleme/hata `.ragna/publish-status.json` dosyasında kalır.

Yeni hash eski cache kayıtlarını kullanım dışı bırakır. Vektörler doğrulanana kadar hybrid retrieval etkinleşmez. `.ragna/` ve kimlik bilgileri Git'e girmez. Bu bir genel dosya ingestion kuyruğu değildir; PDF parsing, antivirüs ve tenant bazlı ingestion henüz uygulanmadı.

### Hata durumunda toparlama

Yayımlama ilk başarısız adımda durur; başarısız işlem tamamlanmış gibi gösterilmez. Migration ve Worker dağıtımı tek atomik işlem değildir. İlerleme kaydını ve uzak migration durumunu kontrol edin; kimlik/ağ sorununu giderdikten sonra aynı release ile `content:publish` tekrar çalıştırılabilir. Uygulanmış migration yeniden uygulanmaz. Vektör doğrulaması başarısızken lexical yol kullanılabilir.

Hatalı içerik için eski migration'ı düzenlemek yerine önceki metni **daha yüksek belge sürümüyle** yeni öneri olarak yayımlayın. Kaynaklarda anlam değiştiyse etkilenen referans yanıtlar ve review seti de incelenmelidir. Retrieval skorunun korunması yeni politikanın doğru olduğunu göstermez.
