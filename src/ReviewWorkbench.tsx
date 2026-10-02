import type { SourceDocument } from '../core/types';
import { useEffect, useState } from 'react';
import dataset from '../data/review-set.json';
import candidates from '../reports/review-candidates.json';
import { reviewSchema, validReviews, type Review } from '../core/review';
const storageKey = 'ragna-review-drafts-v1';
const saveJson = (value: unknown, name: string) => {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
};
export default function ReviewWorkbench() {
  const [selected, setSelected] = useState(dataset.questions[0].id);
  const [reviews, setReviews] = useState<Review[]>(() => {
    try {
      return validReviews(
        JSON.parse(localStorage.getItem(storageKey) || '[]'),
        dataset.corpusHash,
        candidates.results,
      );
    } catch {
      return [];
    }
  });
  const [message, setMessage] = useState('');
  const [liveHash, setLiveHash] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((d) => setLiveHash((d as { corpusHash: string }).corpusHash))
      .catch(() => setLiveHash(null));
  }, []);
  const [sources, setSources] = useState<
    { id: string; title: string; sections: { heading: string; text: string }[] }[]
  >([]);
  const [sourceError, setSourceError] = useState('');
  const q = dataset.questions.find((q) => q.id === selected)!;
  const candidate = candidates.results.find((c) => c.questionId === selected);
  const reviewed = reviews.find((r) => r.questionId === selected);
  const compatible =
    dataset.corpusHash === candidates.corpusHash && liveHash === dataset.corpusHash;
  useEffect(() => {
    let active = true;
    setSources([]);
    setSourceError('');
    Promise.all(
      q.evidence.map(async (id) => {
        const r = await fetch(`/api/sources/${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error('Kaynaklar yüklenemedi. Bağlantıyı kontrol edin.');
        return r.json() as Promise<SourceDocument>;
      }),
    )
      .then((s) => {
        if (active) setSources(s);
      })
      .catch((e) => {
        if (active) setSourceError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate || !compatible) return;
    const f = new FormData(event.currentTarget);
    const r = reviewSchema.safeParse({
      questionId: q.id,
      requestId: candidate.answer.requestId,
      corpusHash: dataset.corpusHash,
      reviewer: f.get('reviewer'),
      correctness: f.get('correctness'),
      support: f.get('support'),
      abstention: f.get('abstention'),
      citations: f.get('citations'),
      note: f.get('note'),
      reviewedAt: new Date().toISOString(),
    });
    if (!r.success) {
      setMessage('Tüm alanları doldurun; kanıt notu en az 10 karakter olmalı.');
      return;
    }
    const next = [...reviews.filter((v) => v.questionId !== q.id), r.data];
    setReviews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setMessage('Bu tarayıcıdaki inceleme taslağı kaydedildi.');
    } catch {
      setMessage('Tarayıcı depolaması kullanılamıyor; JSON olarak dışa aktarın.');
    }
  }
  const correct = reviews.filter((r) => r.correctness === 'correct').length;
  const supported = reviews.filter((r) => r.support === 'supported').length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">İNSAN DEĞERLENDİRMESİ</div>
          <h1>Yanıtı kanıtıyla değerlendirin.</h1>
          <p>40 soru · Türkçe/İngilizce · altı senaryo türü</p>
        </div>
        <button
          className="button"
          onClick={() =>
            saveJson(
              {
                version: dataset.version,
                corpusHash: dataset.corpusHash,
                status: 'local-review-draft',
                reviews,
              },
              'ragna-inceleme-taslagi.json',
            )
          }
        >
          İncelemeleri indir
        </button>
      </div>
      <div className="notice">
        {dataset.description} Buradaki puanlar yalnızca bu tarayıcıdaki kişisel inceleme
        taslaklarıdır; yayımlanmış kalite skoru değildir.
      </div>
      {!compatible && (
        <p className="notice" role="status">
          Canlı corpus sürümü bu inceleme setiyle henüz eşleştirilemedi. Eski yanıtlar
          incelenebilir; puan kaydı için aynı kaynak sürümü gerekir.
        </p>
      )}
      <div className="review-summary">
        <span>{reviews.length} / 40 incelendi</span>
        <span>Tam doğru: {reviews.length ? `${correct}/${reviews.length}` : '—'}</span>
        <span>Kaynakla desteklenen: {reviews.length ? `${supported}/${reviews.length}` : '—'}</span>
        <span>{candidates.results.length} kayıtlı sistem yanıtı</span>
      </div>
      <label className="lab-label">
        İncelenecek soru
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setMessage('');
          }}
        >
          {dataset.questions.map((item) => (
            <option key={item.id} value={item.id}>
              {reviews.some((r) => r.questionId === item.id) ? '✓ ' : ''}
              {item.id} · {item.question}
            </option>
          ))}
        </select>
      </label>
      <section className="panel lab-panel">
        <h2>{q.question}</h2>
        <p>
          <strong>Beklenen davranış:</strong>{' '}
          {q.shouldAbstain
            ? 'Kaynaklarda yeterli bilgi yok; yanıt vermekten kaçınmalı.'
            : 'Güncel kaynaklarla yanıt vermeli.'}
        </p>
        <h3>Referans yanıt taslağı</h3>
        <p>{q.referenceAnswer}</p>
        <small>
          Referans da insan incelemesi bekler. Senaryo: {q.category} · Soru: {q.id}
        </small>
        <h3>Kayıtlı sistem yanıtı</h3>
        {candidate ? (
          <>
            <p>{candidate.answer.answer}</p>
            <small>
              {candidate.answer.provider} · {candidate.answer.model || 'Model çıktısı yok'} ·{' '}
              {new Date(candidate.collectedAt).toLocaleString('tr-TR')} · {candidate.answer.mode}
            </small>
            {candidate.answer.fallbackReason && (
              <p className="notice">
                Bu kayıt fallback/kaçınma davranışını da içerir. Neden:{' '}
                {candidate.answer.fallbackReason}. Canlı model başarısı olarak sayılmaz.
              </p>
            )}
            <details>
              <summary>Yanıttaki atıflar</summary>
              {candidate.answer.citations.map((c) => (
                <blockquote key={c.id}>
                  [{c.id}] {c.title} · v{c.version}
                  <p>{c.excerpt}</p>
                </blockquote>
              ))}
            </details>
          </>
        ) : (
          <p>Bu soru için henüz sistem yanıtı toplanmadı.</p>
        )}
        <h3>Beklenen kaynaklar</h3>
        {sourceError && <p role="alert">{sourceError}</p>}
        {!q.evidence.length && <p>Bu senaryo için destekleyici referans belge yok.</p>}
        {sources.map((d) => (
          <details key={d.id}>
            <summary>{d.title}</summary>
            {d.sections.map((s) => (
              <div key={s.heading}>
                <h4>{s.heading}</h4>
                <p>{s.text}</p>
              </div>
            ))}
          </details>
        ))}
      </section>
      <form className="panel lab-panel review-form" key={selected} onSubmit={submit}>
        <h2>İnceleme ölçütleri</h2>
        <div className="lab-grid">
          <label>
            İnceleyen adı / takma adı
            <input
              name="reviewer"
              defaultValue={reviewed?.reviewer || ''}
              minLength={2}
              maxLength={80}
              required
              autoComplete="off"
            />
          </label>
          {[
            [
              'correctness',
              'Yanıt doğruluğu',
              [
                ['correct', 'Doğru'],
                ['partial', 'Kısmen doğru'],
                ['incorrect', 'Yanlış'],
              ],
            ],
            [
              'support',
              'Kaynak desteği',
              [
                ['supported', 'Destekleniyor'],
                ['partial', 'Kısmen'],
                ['unsupported', 'Desteklenmiyor'],
              ],
            ],
            [
              'abstention',
              'Yanıt verme / kaçınma kararı',
              [
                ['appropriate', 'Uygun'],
                ['inappropriate', 'Uygunsuz'],
              ],
            ],
            [
              'citations',
              'Atıflar',
              [
                ['sufficient', 'Yeterli'],
                ['incomplete', 'Eksik'],
                ['wrong', 'Yanlış'],
              ],
            ],
          ].map(([key, label, options]) => (
            <label key={key as string}>
              {label as string}
              <select
                name={key as string}
                defaultValue={reviewed?.[key as keyof Review] || ''}
                required
              >
                <option value="">Seçin</option>
                {(options as string[][]).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label>
          Kanıta dayalı açıklama
          <textarea
            name="note"
            defaultValue={reviewed?.note || ''}
            minLength={10}
            maxLength={2000}
            required
            placeholder="İddia hangi kaynakla destekleniyor veya çelişiyor?"
          />
        </label>
        <button className="button primary" disabled={!candidate || !compatible}>
          İnceleme taslağını kaydet
        </button>
        <p role="status">{message}</p>
      </form>
    </>
  );
}
