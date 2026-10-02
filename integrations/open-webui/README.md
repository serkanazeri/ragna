# Open WebUI entegrasyonu

Open WebUI yerel mühendislik sohbet arayüzüdür. Herkese açık RAGNA uygulaması Cloudflare üzerinde bağımsız çalışır.

```bash
npm run secrets:init
npm run build
npm run db:local
npm run preview
# Docker açıkken ikinci terminalde:
npm run webui
```

[http://localhost:3000](http://localhost:3000) adresini açın ve ilk yerel yönetici hesabını oluşturun. Sabitlenen image `ghcr.io/open-webui/open-webui:v0.11.1` sürümüdür. Port yalnızca loopback adresine bağlıdır; veriler Docker named volume içinde tutulur. İlk kurulum büyük bir image indirebilir.

Compose, OpenAI uyumlu bağlantıyı `http://host.docker.internal:8787/v1` adresine yönlendirir. **ragna** modelini seçin. Sunucu kimlik doğrulaması için Git dışında tutulan `.dev.vars` dosyasından `RAGNA_API_KEY` okunur. Atıflar yanıt metninde gösterilir. SSE çıktısı, tüm yanıt doğrulandıktan sonra gönderilir; gerçek token streaming değildir.

## Kaynak kartları

Native atıf kartları için `ragna_pipe.py` dosyasını **Admin Panel → Functions** alanından içe aktarın, etkinleştirin ve **RAGNA · RAG Atölyesi** modelini seçin. Functions sunucu tarafında Python çalıştırır; etkinleştirmeden önce kodu inceleyin.

Pipe, anahtarı sunucu ortamından alır; atıf/durum olayları gönderir ve her zaman public corpus ister. Open WebUI rolü veya kullanıcının prompt'u iç operasyon belgelerine erişim yetkisi vermez. Cache yanıtları ayrıca etiketlenir.

## Buluttaki API'ye bağlanma

OpenAI bağlantısının base URL değerini `https://your-worker.workers.dev/v1` yapın. Pipe kullanılıyorsa `RAGNA_BASE_URL` değerinde `/v1` bulunmamalıdır. Operatör anahtarı yalnızca güvenilir yerel kurulumla paylaşılır; herkese açık web uygulaması bu anahtara ihtiyaç duymaz.

## Yerel Gemma

Ollama'yı başlatın. `.dev.vars` içinde `OLLAMA_BASE_URL=http://localhost:11434`, `MODEL_ROUTE=local-first` ve `ollama list` ile eşleşen `LOCAL_MODEL` değerini ayarlayın. Wrangler'ı yeniden başlatın. Yerel çıkarım 45 saniye, Pipe'ın toplam API beklemesi 90 saniyeyle sınırlıdır.

API yalnızca son kullanıcı sorusunu kullanır. Çok turlu query rewriting ve dosya eki ingestion uygulanmadı.

Kaynaklar: [Open WebUI başlangıç](https://docs.openwebui.com/getting-started/quick-start/), [Pipe Functions](https://docs.openwebui.com/features/extensibility/plugin/functions/pipe/). Open WebUI'ın lisans ve markalama kuralları projenin MIT lisansından bağımsızdır.
