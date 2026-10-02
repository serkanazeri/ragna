# Dağıtım ve işletim rehberi

## Cloudflare

Wrangler OAuth veya kapsamı sınırlı bir deployment token gerekir. İlk kurulum `ragna` ve `ragna-sources` adlı kaynaklar oluşturur; mevcut kaynakları incelemeden aynı adlarla yeni kurulum başlatmayın.

```bash
npm ci
npx wrangler login
CLOUDFLARE_ACCOUNT_ID=your-account-id npm run cloud:provision
npx wrangler d1 migrations apply ragna --remote --config wrangler.production.json
npm run deploy
```

Wrangler'ın döndürdüğü URL'yi kullanın. Git dışında tutulan `wrangler.production.json` içindeki `vars.SITE_URL` bu URL olmalıdır. Başka hesaplarda yazarın workers.dev adresi kullanılmaz.

```bash
npm run secrets:init
npm run secrets:deploy
RAGNA_URL=https://your-worker.workers.dev npm run cloud:index
RAGNA_URL=https://your-worker.workers.dev npm run test:smoke
RAGNA_URL=https://your-worker.workers.dev npm run cache:warm
```

**OpenRouter isteğe bağlıdır.** Workers AI ile çalışan demo için `OPENROUTER_API_KEY` gerekmez. İkinci sağlayıcı kullanılacaksa anahtar `.dev.vars` dosyasına eklenir; `secrets:deploy` yalnızca tanımlı sunucu secret'larını stdin üzerinden gönderir, değerlerini yazdırmaz. `WEBUI_SECRET_KEY` yerelde kalır. Secret'ları frontend'e, `vars` alanına veya GitHub'a koymayın.

## Mevcut kurulumu güncelleme

```bash
npm ci
npx wrangler d1 migrations apply ragna --remote --config wrangler.production.json
npm run deploy
```

Cache için `0003_answer_cache.sql`, trafik ayrımı için `0004_traffic_source.sql`, periyodik kontroller için `0005_health.sql` migration'ları uygulanmalıdır. Migration'ları yeni Worker dağıtımından önce çalıştırın. Eski telemetry kayıtları `legacy` olarak korunur. Worker eski sürüme döndürülse de ek tablo zararsız kalır. Kaynak/prompt/model politikası değişirse cache anahtarının da değiştiğini doğrulayın; prompt düzenlemelerinde `CACHE_POLICY` sürümünü artırın.

`cache:warm` seçili örnek soruları gerçek API üzerinden geçirir. Mevcut cache'i tekrar kullanır; eksik yanıtlar model kotasını tüketir. Model yanıt vermezse sahte cache kaydı oluşturulmaz.

## Kontroller

`GET /api/status`; sağlayıcı yapılandırması, corpus sürümü/hash ve index hazırlığını bildirir. Yapılandırılmış olmak sağlık kontrolü değildir. Bir soru sorun, yanıt türünü ve trace kaydını inceleyin.

- İlk yanıt `live`, tekrarında `cached` olmalıdır; cache hit günlük model rezervasyonunu artırmaz.
- `guided`, önceden hazırlanmış referans örnektir; model cache'i değildir.
- `npm run evaluate:live` yetkili `refreshCache: true` kullanır ve gerçek inference ölçer.
- PWA'yı HTTPS üzerinde veya localhost'ta test edin. Manifest ve `/sw.js` 200 dönmelidir. İlk yükleme çevrimiçi yapılır.
- Yeni bir build'de service worker otomatik güncellenir. Sayfayı yeniden açmak en yeni arayüzü yükler; arka planda çalışan eski sekme mevcut görünümünü koruyabilir.

Uygulama bütçesi hesap geneli fatura sınırı değildir. Indexleme ve retrieval değerlendirmeleri embedding çağrılarını ayrıca tüketir. Cloudflare ücretsiz kotası başka projelerle paylaşılabilir.

İsteğe bağlı Turnstile için `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` ve doğru `SITE_URL` gerekir. Sunucu hostname doğrulaması yapar. Mevcut sürüm IP ve günlük model rezervasyonu sınırlarını kullanır.

## Hata inceleme

1. Yanıt türü, fallback nedeni ve trace adımlarını inceleyin.
2. `wrangler tail ragna` ile hatalara bakın; secret veya ziyaretçi verisi içeren logları yayımlamayın.
3. D1 migration'larını ve corpus hash eşleşmesini kontrol edin.
4. Vectorize indexleme sonucunu, `audience` ve `status` filtrelerini doğrulayın.
5. Model kotasını inceleyin. OpenRouter yalnızca yapılandırılmışsa anahtar/kredi kontrolü yapın.

## Geri alma

Son çalışan Git commit'ini ve Wrangler sürüm kimliğini saklayın. `npx wrangler rollback` Worker/assets sürümünü geri alır; D1 verisini geri almaz. Veritabanı sorunlarını yeni bir düzeltme migration'ıyla çözün. Corpus geri alınırsa hybrid retrieval öncesi karşılık gelen sürümü yeniden indexleyin.

## GitHub CI

Workflow; provider secret'ı olmadan bağımlılık kurulumunu, biçim kontrolünü, build, test ve offline değerlendirmeyi çalıştırır. Deployment manuel tutulur; dış katkıların koduna dağıtım kimlik bilgileri verilmez. Lockfile değişiklikleri incelenmelidir.

## Periyodik kontroller ve içerik yayımlama

Worker Cron gerçek modeli 6 saatte bir kontrol eder; ilk dağıtımdan sonra `RAGNA_URL=https://your-worker.workers.dev npm run health:check` ile ilk kontrolü başlatın. `npm run monitor` dışarıdan erişimi denetler. GitHub Actions `Demo erişilebilirliği` workflow'u 2 saatte bir, main push'larında ve manuel tetiklemelerde çalışır. Yeni ortama uyarlarken monitor varsayılan URL'sini veya `RAGNA_URL` değişkenini güncelleyin.

İçerik güncellemeleri için [kalite ve operasyon rehberindeki](quality-and-operations.md) `content:preview`, `content:apply`, `content:publish` sırasını izleyin. Yayımlama kimlik bilgileri genel arayüze veya GitHub workflow'larına verilmez.
