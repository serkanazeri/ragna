# İlk sürüm doğrulaması — 2 Ekim 2026

| Kontrol                        | Kanıt                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript ve production build | `npm run build` başarılı                                                                                                           |
| Regresyon testleri             | Retrieval yetkilendirmesi/sürümleme, atıf doğrulaması, sağlayıcı fallback'i, bağlam sınırı ve sıralı bütçe işlemleri               |
| Offline değerlendirme          | 60 soru × 3 chunk yapılandırması; ham sonuçlar depoda                                                                              |
| Bulutta retrieval              | 60 FTS5 ve 60 hybrid isteği; bu sentetik veri kümesinde Recall@5 %61,4 → %95,4                                                     |
| Canlı yanıt üretimi            | 24/24 istek Workers AI'a ulaştı; kaynak/yanıt ayrıntıları üretim baseline raporunda                                                |
| Hedefli düzeltmeler            | İngilizce yanıtlar ve abstention kararları 5 açık regresyon senaryosunda kontrol edildi; genelleme iddiası yok                     |
| Vektör etkinleştirme           | 51 vektörün tamamı eşleşen corpus hash ile doğrulandı; API doğrulama grupları 20 kimlik sınırına uyuyor                            |
| Sentetik üretim                | Yerel `gemma4:12b-mlx`, birebir kaynak alıntılarıyla 3 aday üretti; insan incelemesi bekliyor                                      |
| Open WebUI                     | Sabitlenmiş v0.11.1 container sağlıklı; Pipe container içinden gerçek API'ye bağlanarak yanıt, atıf ve durum olayları üretti       |
| Tarayıcı                       | Masaüstü genel bakış/değerlendirme ve kayıtlı yanıt akışı kontrol edildi; 390 px mobil görünümde sayfa genelinde yatay taşma yoktu |
| OpenRouter                     | Sağlayıcı adaptörü ve fallback, sözleşme testleriyle kapsandı; isteğe bağlı canlı yol için operatör API anahtarı yapılandırılmadı  |

Open WebUI'ın ilk yönetici hesabının oluşturulması operatöre bırakıldı. OpenAI uyumlu bağlantısı Compose ile yapılandırıldı; isteğe bağlı native atıf Pipe'ı yönetim arayüzünden içe aktarılabilir.

Container ile ana makine arasındaki entegrasyon; gerçek model keşfi, yerel `gemma4:12b-mlx` inference ve buffer'lı OpenAI uyumlu SSE yanıtını da başarıyla tamamladı. Kontrol edilen Türkçe iade sorusu, atıflı 30 gün yanıtını 5,16 saniyede üretti. İlk 12 saniyelik yerel çağrı zaman aşımına uğradı; thinking'in kapatılması ve yerel zaman aşımının 45 saniyeye çıkarılması gözlenen sorunu çözdü. Bu tek bir işlev kontrolüdür; latency benchmark değildir.

İlk yayımlanan commit, GitHub Actions doğrulamasını (`Verify`, çalışma `36994656588`) geçti. Bu çalışma temiz bağımlılık kurulumu, biçim kontrolü, build, regresyon testleri ve offline değerlendirmeyi kapsadı.

Cloudflare model çıktısı daha yeni, OpenAI biçiminde bir `choices` zarfı kullanır. İlk entegrasyon çalışması bu uyumsuzluğu ortaya çıkardı; adaptör ve regresyon testi artık bu zarfı kapsıyor. Test başarısızlıkları operasyon panelinin 24 saatlik penceresinde görünür kalır; gösterilen başarı oranını artırmak için silinmez.

İlk üretim çalışmasında stok sorusunun parafrazında retrieval eksikliği, İngilizce sorulara Türkçe yanıtlar ve abstention alanı/metni arasında tutarsızlıklar görüldü. Sonraki değişiklikler gözlenen durumları iyileştirdi. Sabit abstention mesajı ham protokol metninin gösterilmesini önler. Yanıtların anlamsal doğruluğu henüz insan tarafından puanlanmadı.

## v0.2 doğrulaması — 2 Ekim 2026

- 33 otomatik test: TTL, kaynak/sürüm/erişim değişimi, bilinmeyen atıf, config invalidation, yetkili cache bypass ve quota dolduğunda cache erişimi dahil.
- Gerçek yerel API: Gemma yanıtı 9.273 ms, aynı sorunun cache yanıtı 4 ms; model rezervasyon sayısı 6 → 7 → 7. Tek fonksiyonel kontrol; latency benchmark değildir.
- Türkçe arayüzde cache etiketi, üretim zamanı, sağlayıcı ve kaynak penceresi görüldü.
- Genel bakış, sohbet, değerlendirmeler, bilgi tabanı ve mühendislik notları; 320/390/768/1024/1440 px genişliklerde kontrol edildi. 25 kombinasyonda sayfa genelinde yatay taşma yoktu. Tablolar ve mobil soru kartları kendi alanlarında kaydırılabilir. Bu test fiziksel cihaz testi değildir.
- Chrome'da service worker kurulduktan sonra yerel sunucu durduruldu; sayfa yeniden yüklendiğinde uygulama arayüzü açıldı ve API erişimi için Türkçe bağlantı uyarısı gösterildi. Kullanıcının cihazına uygulama kurulmadı; Safari/iOS gerçek cihaz kurulumu ayrıca kontrol edilmelidir.
- Manifest, 192/512 px PNG ikonlar, maskable ikon, aynı origin'den Inter fontları ve versiyonlanmış static precache eklendi. API yanıtları browser cache'ine dahil edilmedi.
- Canlı Cloudflare smoke kontrolü geçti. Dört kaynaklı örnek yanıt Workers AI ile hazırlanarak cache'e alındı; yanıtlanamayan iki örnek saklanmadı. Aynı sorunun iki anonim isteği `cached` döndü, ayrı request ID üretti ve model rezervasyon sayısı 47 → 47 kaldı. Bu isteklerde model token kullanımı sıfırdı; dashboard iki cache hit gösterdi.
- Cloudflare v0.2 dağıtımı: `1f5753f7-555d-4d0b-9b65-51adbc59f346`. Manifest, service worker ve ikonlar canlıda HTTP 200 döndü. README ekran görüntüsü canlı Türkçe arayüzden yenilendi.
