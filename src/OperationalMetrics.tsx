import { trafficLabels, trafficSources, type Metrics, type TrafficScope } from '../core/metrics';
const time = (n: number | null) =>
  n == null
    ? '—'
    : n >= 1000
      ? `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} sn`
      : `${Math.round(n)} ms`;
const percent = (n: number | null) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 }).format(n);
const labels: Record<string, string> = {
  live: 'Canlı model yanıtı',
  cached: 'Cache yanıtı',
  guided: 'Kayıtlı örnek',
  evidence: 'Kaynak alıntısı',
  abstained: 'Yanıt verilmedi',
};
export default function OperationalMetrics({
  metrics,
  scope,
  onScope,
}: {
  metrics: Metrics | null;
  scope: TrafficScope;
  onScope: (scope: TrafficScope) => void;
}) {
  const data = metrics?.scope === scope ? metrics : null;
  return (
    <section className="panel operations-panel" aria-label="Operasyon metrikleri">
      <div className="panel-heading operations-heading">
        <div>
          <h2>Canlı operasyon</h2>
          <p>
            Son 24 saat · {trafficLabels[scope]} ·{' '}
            {data ? `${data.sampleSize} kayıt ölçüldü` : 'Yükleniyor…'}
          </p>
        </div>
        <label className="traffic-filter">
          Trafik kaynağı
          <select value={scope} onChange={(e) => onScope(e.target.value as TrafficScope)}>
            <option value="all">Tüm trafik</option>
            {trafficSources.map((s) => (
              <option key={s} value={s}>
                {trafficLabels[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="traffic-summary">
        {trafficSources.map((s) => (
          <span key={s}>
            {trafficLabels[s]} <strong>{data?.trafficCounts[s] ?? '—'}</strong>
          </span>
        ))}
      </div>
      <p className="metrics-explanation">
        Yukarıdaki trafik sayıları 24 saatin tamamını kapsar. Aşağıdaki metrikler seçili trafiğe
        aittir. Eski kayıtların trafik kaynağı bilinmediği için ayrı tutulur. Ziyaretçi sınıfı,
        kimliği doğrulanmamış trafiği kapsar; insan/bot ayrımı yapmaz.
      </p>
      {data?.truncated && (
        <p className="notice" role="status">
          Seçili {data.matchedCount} kaydın en yeni 1.000 tanesi ölçülüyor. Sonuçlar 24 saatin
          tamamını temsil etmeyebilir.
        </p>
      )}
      {data?.sampleSize === 0 && (
        <p className="notice" role="status">
          Bu trafik grubunda henüz kayıt yok. Veri olmayan metrikler — ile gösterilir.
        </p>
      )}
      <div className="operational-grid">
        <div>
          <span>Ölçülen istek</span>
          <strong>{data?.sampleSize ?? '—'}</strong>
          <small>{data ? `${data.matchedCount} eşleşen kayıt` : '—'}</small>
        </div>
        <div>
          <span>Cache hit oranı</span>
          <strong>{percent(data?.cacheHitRate ?? null)}</strong>
          <small>
            {data ? `${data.cached} / ${data.cacheEligibleCount} kayıtlı örnek dışı istek` : '—'}
          </small>
        </div>
        <div>
          <span>Sağlayıcı hatası görülen istek</span>
          <strong>{percent(data?.fallbackRate ?? null)}</strong>
          <small>
            {data
              ? `${data.fallbackCount} / ${data.inferenceCount} inference · ${data.recoveredCount} kurtarıldı`
              : '—'}
          </small>
        </div>
        <div>
          <span>Olumlu geri bildirim</span>
          <strong>{percent(data?.positiveFeedback ?? null)}</strong>
          <small>{data?.feedbackCount ?? 0} değerlendirme</small>
        </div>
      </div>
      <div className="metrics-tables">
        <div>
          <h3>Yanıt türüne göre toplam süre</h3>
          <div className="metrics-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Yanıt türü</th>
                  <th>n</th>
                  <th>p50</th>
                  <th>p95</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(labels).map(([mode, label]) => {
                  const d = data?.latencyByMode[mode];
                  return (
                    <tr key={mode}>
                      <td>{label}</td>
                      <td>{d?.count ?? 0}</td>
                      <td>{time(d?.p50Ms ?? null)}</td>
                      <td>{time(d?.p95Ms ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Uygulama işlem süresi; istemci ağ süresi, cache yazımı ve telemetry yazımı hariç. Yanıt
            verilmedi türü model veya kaynak yetersizliği kararlarını içerebilir.
          </p>
        </div>
        <div>
          <h3>İşlem aşamaları</h3>
          <div className="metrics-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Aşama</th>
                  <th>n</th>
                  <th>p50</th>
                  <th>p95</th>
                </tr>
              </thead>
              <tbody>
                {(['retrieval', 'generation'] as const).map((stage) => {
                  const d = data?.stages[stage];
                  return (
                    <tr key={stage}>
                      <td>{stage === 'retrieval' ? 'Retrieval' : 'Generation'}</td>
                      <td>{d?.count ?? 0}</td>
                      <td>{time(d?.p50Ms ?? null)}</td>
                      <td>{time(d?.p95Ms ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Retrieval, cache ve kayıtlı örnekleri dışlar. Generation, istek başına tüm model
            denemelerinin süre toplamıdır; başarısız denemeler ve çıktı doğrulaması dahildir. TTFT
            değildir. Aşamaların p95 değerleri toplanmaz.
          </p>
        </div>
      </div>
      <div className="provider-metrics">
        <h3>Sağlayıcı denemeleri</h3>
        <div className="metrics-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sağlayıcı</th>
                <th>Deneme</th>
                <th>Başarılı</th>
                <th>Hata</th>
                <th>Timeout</th>
                <th>Sonraki sağlayıcıya geçiş</th>
                <th>p95</th>
              </tr>
            </thead>
            <tbody>
              {(data?.providers ?? []).map((p) => (
                <tr key={p.provider}>
                  <td>{p.provider}</td>
                  <td>{p.attempts}</td>
                  <td>{p.successes}</td>
                  <td>
                    {p.errors} · {percent(p.errorRate)}
                  </td>
                  <td>
                    {p.timeouts} · {percent(p.timeoutRate)}
                  </td>
                  <td>
                    {p.fallbackCount} · {percent(p.fallbackRate)}
                  </td>
                  <td>{time(p.p95Ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Oranların paydası ilgili sağlayıcının deneme sayısıdır. Timeout hata sayısına dahildir.
          Başarılı, çıktı sözleşmesinin geçmesi anlamındadır; anlamsal doğruluk skoru değildir.
          Geçiş, hata sonrası gerçekten başka sağlayıcı denenmesini sayar.
        </p>
      </div>
      <div className="operational-grid secondary-operations">
        <div>
          <span>Bildirilen model maliyeti</span>
          <strong>
            {data?.reportedCostUsd == null ? '—' : `$${data.reportedCostUsd.toFixed(4)}`}
          </strong>
          <small>Seçili trafik · maliyeti bilinen sonuçlar</small>
        </div>
        <div>
          <span>Maliyet kapsamı</span>
          <strong>{percent(data?.costCoverage ?? null)}</strong>
          <small>
            {data ? `${data.costReportedCount} / ${data.costSampleCount} model sonucu` : '—'}
          </small>
        </div>
        <div>
          <span>Günlük rezervasyon / sınır</span>
          <strong>
            {data
              ? `$${data.budget.reservedUsd.toFixed(2)} / $${data.budget.dailyLimitUsd.toFixed(2)}`
              : '—'}
          </strong>
          <small>Tüm trafik · fatura tutarı değildir</small>
        </div>
        <div>
          <span>Günlük model rezervasyonu</span>
          <strong>
            {data ? `${data.budget.requests} / ${data.budget.dailyRequestLimit}` : '—'}
          </strong>
          <small>Tüm trafik · cache hariç</small>
        </div>
      </div>
      <p className="metrics-explanation">
        n: geçerli süre ölçümü sayısı. Boş örneklem sıfır süre olarak gösterilmez. Maliyet, son
        model sonucunda bildirilen tutarı kapsar; başarısız önceki denemelerin ücreti
        bilinmeyebilir. Telemetry'ye yazılamayan istekler ve API girişinde reddedilen HTTP istekleri
        bu panelde yoktur.
      </p>
    </section>
  );
}
