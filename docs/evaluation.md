# Değerlendirme protokolü

## Tekrarlanabilir baseline

`npm run evaluate`, sabit bir sentetik corpus ve soru kümesi kullanır. Girdiler hash değerleriyle tanımlanır. Üç yapılandırmada da sorular, tokenizer, BM25 uygulaması ve ilk beş chunk sınırı aynıdır. Metrik, bu sınır uygulandıktan sonra tekrar eden belge kimliklerini eler. Dolayısıyla aynı politikadan gelen birden fazla chunk, birden çok politikayı ilgilendiren sorunun kaynak kapsamasını azaltabilir.

- Recall@5 = getirilen referans belge sayısı / toplam referans belge sayısı.
- MRR = ilk referans belgenin sırasının tersi; belge bulunamadıysa sıfır.
- nDCG@5 = sıralamaya göre ağırlığı azaltılmış ikili belge ilgililiği / ideal sıralamanın ağırlıklı ilgililiği.
- Yanıtlanamayan sorularda pozitif referans belge yoktur; bu sorular üç metriğin paydasına dahil edilmez.
- Erişim sızıntısı sayımı, public sorgularda gösterilen eski belgeleri ve yalnızca `operations` kapsamına açık belgeleri kapsar.

Holdout ayrımı, olağan sorularda farklı politika ailelerini kapsar. Adversarial ve zamansal edge case'ler mevcut aileleri bilinçli olarak tekrar kullanır. Bu nedenle kusursuz bağımsız bir benchmark değildir. Sentetik sorular, yazılmış kaynakların diline benzeyebilir ve gerçek kullanıcı sorgularındaki retrieval kalitesini olduğundan yüksek gösterebilir.

## Canlı retrieval

`npm run evaluate:retrieval`, 60 sorunun tamamını yanıt üretmeden, kimlik doğrulamalı retrieval endpoint'ine gönderir. Tam küme ve holdout metriklerini, yanıt türünü, kaynak kimliklerini, corpus hash değerini, span'leri ve gecikmeyi kaydeder. Gerçek D1 FTS5 yolunu ölçmek için `LEXICAL_ONLY=1` ayarlayın. Bu sonucu hybrid sonuçlarla karşılaştırın; offline BM25 ile hybrid arasındaki farkı yalnızca embedding'lere bağlamayın.

## Canlı yanıt üretimi

`npm run evaluate:live`, varsayılan olarak 12 holdout sorusu kullanır ve her tam yanıtı inceleme için saklar. `EVAL_LIMIT` en fazla 60 olabilir. Her kalite sonucunda sağlayıcı ve yanıt türü bulunmalıdır. Fallback veya kayıtlı örnek satırı, başarılı canlı üretim olarak sayılamaz.

Referans terim kapsaması bir hata ayıklama yardımcısıdır. Doğru sayıyı içeren yanlış bir ifadeyi ödüllendirebilir. Atıf verilen belge recall'ı, belirli iddiayı desteklemeyen bir kaynağı ödüllendirebilir. İkisi de doğruluk skoru değildir. İddiaları, retrieval ile getirilen kaynak pasajlarıyla birebir karşılaştırın.

## İnsan değerlendirmesi ölçütleri

Her canlı yanıt için şunları kaydedin: doğru / kısmen doğru / yanlış; kaynakla destekleniyor / kısmen destekleniyor / desteklenmiyor; yanıt vermekten kaçınma kararı uygun / uygunsuz; atıflar yeterli / eksik / yanlış. Kısa, kanıta dayalı bir açıklama ekleyin. Çok dilli parafrazları, birden fazla politikanın sentezini, eski/güncel kaynak çelişkilerini, bilinmeyen bilgileri, rol iddialarını ve kaynak içindeki prompt injection girişimlerini ayrı değerlendirin.

Model tabanlı değerlendirici eklenirse insan değerlendirmesiyle kalibrasyon, sabitlenmiş model sürümü ve ölçütler, görüş ayrılığı analizi ve kaynak/yanıt ayrımı gerekir. Bağımsız inceleme olmadan aynı modelin soruları, yanıtları ve kendi yanıtını onaylayan kalite skorunu üretmesine dayanmayın.

## Sürüm yayımlama koşulları

- TypeScript, birim testleri ve sağlayıcı regresyon testleri geçer.
- Sabit regresyon sorularında yetkisiz veya arşivlenmiş kaynak sızıntısı gözlenmez.
- Yerel ve dağıtılmış HTTP smoke kontrolleri geçer.
- Canlı yanıtlar gerçek sağlayıcı/model ve trace bilgisini gösterir; başarısızlıklar etiketlenir.
- Hybrid etkinleştirilmeden önce vektör index hash değeri dağıtılmış corpus ile eşleşir.
- Commit'te secret dosyası, gerçek kimlik bilgisi veya müşteri verisi bulunmaz.
- Model/embedding üstünlüğü ve erişilebilirlik SLO'ları, bunları destekleyen kanıt olmadan iddia edilmez.

İyileştirme hedefleri ölçülene kadar hipotezdir: erişim regresyonu olmadan daha iyi iki dilli holdout recall, temsilî eşzamanlı yükte makul p95 ve insan değerlendirmesinde kaynaklarla desteklenen yüksek yanıt oranı. İlk dağıtımın belirlenmiş bir production SLO'su yoktur.

Modelin yanıt vermekten kaçınma kararları, `abstained:true` gibi bozuk protokol metinleri yerine kullanıcıya yönelik sabit bir mesajla sunulur. Küçük bir TR/EN soru öneki kuralı mesaj dilini seçer. Sağlayıcı/model kaydı kararın kökenini korur. Bu sunum normalizasyonu, yanıt verilmiş bir soruyu abstention'a dönüştürmez ve doğruluğu kanıtlamaz.

## Cache ve canlı ölçümler

`evaluate:live`, yetkili `refreshCache: true` ile yeni inference ister. Cache yanıtları model doğruluğu veya model gecikmesi olarak raporlanmamalıdır. Operasyon paneli cache yanıtlarını ayrı sayar. Cache hit için bu isteğin üretim maliyeti sıfırdır; önceki üretimin maliyeti asıl istek kaydında kalır. Corpus/yapılandırma değişiminde geçersizleşme, TTL, erişim kapsamı ve bütçe tüketmeme davranışı regresyon testleriyle korunur.
