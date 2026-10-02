import { useEffect, useState } from 'react';
import { previewContent } from '../core/content';
import type { SourceDocument } from '../core/types';
export default function ContentWorkbench() {
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  const [id, setId] = useState('returns');
  const [original, setOriginal] = useState<SourceDocument | null>(null);
  const [text, setText] = useState('');
  const [hash, setHash] = useState('');
  const [result, setResult] = useState<ReturnType<typeof previewContent> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/corpus')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setDocs((d as { documents: { id: string; title: string }[] }).documents))
      .catch(() => setError('Belge listesi yüklenemedi.'));
    fetch('/api/status')
      .then((r) => r.json())
      .then((d) => setHash((d as { corpusHash: string }).corpusHash))
      .catch(() => setError('Corpus sürümü yüklenemedi.'));
  }, []);
  useEffect(() => {
    let active = true;
    setResult(null);
    setOriginal(null);
    fetch(`/api/sources/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<SourceDocument>;
      })
      .then((d) => {
        if (active) {
          setOriginal(d);
          setText(JSON.stringify({ ...d, version: d.version + 1 }, null, 2));
          setError('');
        }
      })
      .catch(() => {
        if (active) setError('Belge yüklenemedi.');
      });
    return () => {
      active = false;
    };
  }, [id]);
  function preview() {
    try {
      if (!original) throw new Error('Önce bir belge yüklenmeli.');
      if (new TextEncoder().encode(text).length > 100000)
        throw new Error('Belge 100 KB sınırını aşıyor.');
      setResult(previewContent([original], JSON.parse(text), []));
      setError('');
    } catch (e) {
      setResult(null);
      setError(
        e instanceof SyntaxError
          ? 'JSON biçimi geçersiz; tırnak, virgül ve parantezleri kontrol edin.'
          : e instanceof Error
            ? e.message
            : 'Geçersiz belge.',
      );
    }
  }
  function download() {
    if (!result || !hash) return;
    const u = URL.createObjectURL(
      new Blob([JSON.stringify({ baseHash: hash, candidate: result.candidate }, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = u;
    a.download = `ragna-${result.candidate.id}-onerisi.json`;
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BELGE YAŞAM DÖNGÜSÜ</div>
          <h1>Değişikliği yayımlamadan inceleyin.</h1>
          <p>Belge → chunk önizlemesi → kalite kontrolü → indexleme → yayımlama</p>
        </div>
      </div>
      <div className="notice">
        Bu alan tarayıcıda çalışan bir önizlemedir. Düzenlemeler sunucuya yüklenmez ve canlı
        kaynakları değiştirmez. Yayımlama yalnızca yetkili operatörün yerel CLI akışından yapılır.
      </div>
      <section className="panel lab-panel">
        <label className="lab-label">
          Güncellenecek sentetik belge
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <label className="lab-label">
          Belge JSON'u
          <textarea
            className="content-json"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            spellCheck={false}
            maxLength={100000}
          />
        </label>
        <button className="button primary" onClick={preview} disabled={!original}>
          Chunk önizlemesi oluştur
        </button>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </section>
      {result && (
        <section className="panel lab-panel">
          <h2>
            v{result.previousVersion} → v{result.candidate.version}
          </h2>
          <p>
            {result.beforeChunkCount} → {result.chunks.length} chunk · Bölüm tabanlı / 450 tahmini
            token
          </p>
          <p>
            Yayımlandığında corpus hash değişir. Eski yanıt cache'i eşleşmez; hybrid retrieval yeni
            vektörler doğrulanana kadar devreye girmez.
          </p>
          {result.chunks.map((c) => (
            <details key={c.id}>
              <summary>
                {c.heading} · {c.tokens} tahmini token
              </summary>
              <p>{c.text}</p>
              <code>{c.id}</code>
            </details>
          ))}
          <button className="button" onClick={download} disabled={!hash}>
            Güncelleme önerisini indir
          </button>
          <h3>Yetkili yayımlama</h3>
          <pre>
            npm run content:preview -- öneri.json{'\n'}npm run content:apply{'\n'}npm run
            content:publish
          </pre>
          <p>
            CLI tüm corpus ile retrieval regresyonlarını denetler, yeni migration üretir, kalite
            kontrollerini çalıştırır, dağıtır, vektörleri doğrular ve smoke test yapar. Etkilenen
            referans yanıtlar önizleme raporunda listelenir; metin doğruluğu ayrıca
            değerlendirilmelidir.
          </p>
        </section>
      )}
    </>
  );
}
