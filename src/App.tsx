import HealthPanel from './HealthPanel';
import ReviewWorkbench from './ReviewWorkbench';
import ContentWorkbench from './ContentWorkbench';
import qualityReport from '../reports/quality-gate.json';
import OperationalMetrics from './OperationalMetrics';
import { trafficLabels, type Metrics, type TrafficScope } from '../core/metrics';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  GitBranch,
  Layers3,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from 'lucide-react';
import cloudEvaluation from '../reports/cloud-retrieval.json';
import type { ChatResponse, EvalRun, SourceDocument, Span } from '../core/types';

type Page = 'overview' | 'ask' | 'experiments' | 'knowledge' | 'decisions' | 'reviews' | 'content';
type Status = {
  environment: string;
  corpusVersion: string;
  providers: { cloudflare: boolean; openrouter: boolean; local: boolean };
  retrieval: string;
  embedding: string | null;
  documentCount: number;
  chunkCount: number;
  questionCount: number;
  turnstileSiteKey: string | null;
};
type Trace = {
  id: string;
  createdAt: string;
  mode: string;
  provider: string;
  model: string | null;
  durationMs: number;
  retrievalMode: string;
  fallbackReason: string | null;
  spans: Span[];
  trafficSource: string;
};
type DocumentSummary = Omit<SourceDocument, 'sections'> & { sections: number; chunkCount: number };
type Example = { id: string; question: string; category: string };
const departmentNames: Record<string, string> = {
  Logistics: 'Lojistik',
  Operations: 'Operasyon',
  Support: 'Destek',
  Trust: 'Güven ve gizlilik',
  Service: 'Servis',
  Enablement: 'Eğitim',
  Success: 'Müşteri başarısı',
  'Customer care': 'Müşteri hizmetleri',
  Finance: 'Finans',
  Sales: 'Satış',
};
const categoryNames: Record<string, string> = {
  'single-hop': 'Single-hop',
  'multi-hop': 'Multi-hop',
  temporal: 'Zaman ve sürüm',
  unanswerable: 'Yanıtlanamayan',
  'access-control': 'Erişim kontrolü',
  adversarial: 'Adversarial',
};
const percent = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('tr-TR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(n);
const time = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
const modeName: Record<string, string> = {
  live: 'Canlı model',
  cached: 'Cache yanıtı',
  guided: 'Kayıtlı örnek',
  evidence: 'Kaynak alıntıları',
  abstained: 'Yanıt verilmedi',
};
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!navigator.onLine)
    throw new Error(
      'Çevrimdışısınız. Yeni sorular ve güncel veriler için internet bağlantısı gerekiyor.',
    );
  const r = await fetch(path, options).catch(() => {
    throw new Error('Sunucuya ulaşılamıyor. Bağlantınızı kontrol edip yeniden deneyin.');
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || 'İstek tamamlanamadı');
  return data;
}
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
function TraceView({ spans }: { spans: Span[] }) {
  const max = Math.max(1, ...spans.map((s) => s.durationMs));
  return (
    <div className="trace-view">
      {spans.map((s, i) => (
        <div className="trace-row" key={i}>
          <span>
            <i className={`dot ${s.status}`} />
            {s.name}
            <small>{s.detail}</small>
          </span>
          <div className="trace-track">
            <i
              style={{ width: `${Math.max(2, (s.durationMs / max) * 100)}%` }}
              className={s.status}
            />
          </div>
          <code>{time(s.durationMs)}</code>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [traffic, setTraffic] = useState<TrafficScope>('visitor');
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loadError, setLoadError] = useState('');
  const [source, setSource] = useState<SourceDocument | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [query, setQuery] = useState('');
  const refresh = () =>
    Promise.all([
      api<Status>('/api/status').then(setStatus),
      api<Metrics>(`/api/metrics?traffic=${traffic}`).then(setMetrics),
    ]).catch((e) => setLoadError(e.message));
  useEffect(() => {
    Promise.all([
      api<Status>('/api/status').then(setStatus),
      api<{ runs: EvalRun[] }>('/api/evaluations').then((r) => setRuns(r.runs)),
      api<{ documents: DocumentSummary[] }>('/api/corpus').then((r) => setDocuments(r.documents)),
      api<Example[]>('/api/examples').then(setExamples),
    ]).catch((e) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setMetrics(null);
    const update = () =>
      api<Metrics>(`/api/metrics?traffic=${traffic}`)
        .then((m) => {
          if (active) setMetrics(m);
        })
        .catch((e) => {
          if (active) setLoadError(e.message);
        });
    void update();
    const timer = setInterval(update, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [traffic]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSource(null);
        setTrace(null);
        setMenu(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  const openSource = (id: string) =>
    api<SourceDocument>(`/api/sources/${encodeURIComponent(id)}`)
      .then(setSource)
      .catch((e) => setLoadError(e.message));
  const navigate = (next: Page) => {
    setPage(next);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  const items: [Page, string, React.ReactNode][] = [
    ['overview', 'Genel bakış', <LayoutDashboard size={18} />],
    ['ask', "Ragna'ya sor", <MessageSquare size={18} />],
    ['experiments', 'Değerlendirmeler', <FlaskConical size={18} />],
    ['knowledge', 'Bilgi tabanı', <Database size={18} />],
    ['reviews', 'Yanıt inceleme', <Check size={18} />],
    ['content', 'Belge iş akışı', <FileText size={18} />],
    ['decisions', 'Mühendislik notları', <GitBranch size={18} />],
  ];
  const cloud = cloudEvaluation.runs.find((r) => r.id === 'cloud-hybrid')!;
  const liveReady = status && Object.values(status.providers).some(Boolean);
  return (
    <div className="app-shell">
      {menu && (
        <button className="mobile-scrim" aria-label="Menüyü kapat" onClick={() => setMenu(false)} />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')}>
          <span className="brand-mark">r</span>
          <span>
            ragna<sup>LAB</sup>
          </span>
        </button>
        <div className="workspace">
          <span className="workspace-icon">
            <Layers3 size={16} />
          </span>
          <div>
            Aster Mobility<small> Örnek çalışma alanı </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label"> ÇALIŞMA ALANI </p>
        <nav>
          {items.map(([id, label, icon]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
              {icon}
              <span>{label}</span>
              {id === 'ask' && <span className="nav-arrow">↗</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div>
            <ShieldCheck size={16} /> Kaynağı belli yanıtlar{' '}
          </div>
          <p>
            Her yanıtın bir kaynağı, <br />
            her kararın bir gerekçesi var.{' '}
          </p>
          <span> SENTETİK VERİ · GERÇEK ÖLÇÜMLER </span>
        </div>
        <a className="author" href="https://www.serkanazeri.com/" target="_blank" rel="noreferrer">
          <span className="avatar">SA</span>
          <div>
            Serkan Azeri<small>Forward Deployed AI Engineer</small>
          </div>
          <ArrowUpRight size={14} />
        </a>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Menüyü aç"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Çalışma alanı <ChevronRight size={13} />
            <strong>{items.find((i) => i[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="system-state">
              <i className={`dot ${liveReady ? 'ok' : ''}`} />
              {liveReady ? 'Model bağlantısı hazır' : 'Kaynak önizlemesi'}
            </span>
            <a
              href="https://github.com/serkanazeri/ragna"
              target="_blank"
              rel="noreferrer"
              className="repo-link"
            >
              <Code2 size={16} /> Kaynak kodu <ArrowUpRight size={13} />
            </a>
          </div>
        </header>
        <main>
          <PwaTools />
          {loadError && (
            <div className="notice warning" role="alert">
              Bağlantı uyarısı: {loadError}
              <button
                onClick={() => {
                  setLoadError('');
                  refresh();
                }}
              >
                Yeniden dene{' '}
              </button>
            </div>
          )}
          {page === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <i /> RAG MÜHENDİSLİK ATÖLYESİ{' '}
                  </div>
                  <h1> Yanıtın arkasındaki kaynağı görün. </h1>
                  <p>
                    {' '}
                    RAG sisteminizin ne bildiğini inceleyin. Yanıtlarını ölçün, kararlarını
                    anlayın.{' '}
                  </p>
                </div>
                <button className="button primary" onClick={() => navigate('ask')}>
                  Soru sorun <ArrowUpRight size={16} />
                </button>
              </div>
              <section className="hero-panel">
                <div className="hero-copy">
                  <Tag tone="light"> 01 / REFERANS PROJE </Tag>
                  <h2>
                    Bir sorudan, <br />
                    kaynağı belli bir yanıta.{' '}
                  </h2>
                  <p>
                    Kurgusal bir hizmet işletmesi üzerinden gerçek mühendislik kararları. Kaynakları
                    inceleyin, retrieval kalitesini ölçün, her yanıtın nasıl oluştuğunu görün.{' '}
                  </p>
                  <button className="text-link" onClick={() => navigate('decisions')}>
                    Mühendislik kararlarını inceleyin <ArrowRight size={16} />
                  </button>
                </div>
                <div className="flow-visual">
                  <div className="flow-node">
                    <MessageSquare size={18} />
                    <span>
                      Soru <small> Niyet ve erişim kapsamı </small>
                    </span>
                    <span className="flow-num">01</span>
                  </div>
                  <div className="flow-line" />
                  <div className="flow-node">
                    <Search size={18} />
                    <span>
                      Kanıtlar <small> Bul · sırala · erişimi doğrula </small>
                    </span>
                    <span className="flow-num">02</span>
                  </div>
                  <div className="flow-line" />
                  <div className="flow-node final">
                    <Sparkles size={18} />
                    <span>
                      Yanıt ve kaynaklar <small> Atıfları doğrula · trace kaydet </small>
                    </span>
                    <Check size={16} />
                  </div>
                </div>
              </section>
              <div className="section-title">
                <h2> Ölçümle görünür olan kalite </h2>
                <Tag> CANLI HYBRID · SENTETİK BENCHMARK </Tag>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="Recall @ 5"
                  value={percent(cloud.metrics.recallAt5)}
                  detail="Yanıtlanabilir 54 sentetik soru"
                  icon={<Search size={16} />}
                />
                <Metric
                  label="Sıralama kalitesi"
                  value={cloud.metrics.ndcgAt5.toFixed(3)}
                  detail="nDCG @ 5 · canlı hybrid"
                  icon={<Layers3 size={16} />}
                />
                <Metric
                  label="Erişim ihlalleri"
                  value={String(cloud.metrics.accessLeaks)}
                  detail="Sabit regresyon setindeki sonuç"
                  icon={<ShieldCheck size={16} />}
                />
                <Metric
                  label="Değerlendirme soruları"
                  value={String(status?.questionCount || '—')}
                  detail="6 senaryo türü · TR + EN"
                  icon={<FlaskConical size={16} />}
                />
              </div>
              <div className="retrieval-summary">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2> Retrieval deneyi </h2>
                      <p> Offline baseline · farklı chunk stratejileri. </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Değerlendirmeleri aç"
                      onClick={() => navigate('experiments')}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <div className="bars">
                    {runs.map((r) => (
                      <div className="bar-row" key={r.id}>
                        <div>
                          <span>
                            {r.strategy === 'sections' ? 'Bölüm tabanlı' : 'Sabit pencere'}{' '}
                            <code>{r.chunkSize}</code>
                          </span>
                          <strong>{percent(r.metrics.recallAt5)}</strong>
                        </div>
                        <div className="bar-track">
                          <i
                            className={r.strategy === 'fixed' ? 'comparison' : ''}
                            style={{ width: `${r.metrics.recallAt5 * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="panel-foot">
                    <CircleHelp size={14} /> Sentetik benchmark. Buluttaki hybrid sonuçları ayrıca
                    ölçülür.{' '}
                  </div>
                </section>
              </div>
              <HealthPanel />
              <OperationalMetrics metrics={metrics} scope={traffic} onScope={setTraffic} />
              <div className="section-title">
                <h2> Bir senaryoyla başlayın </h2>
                <span className="muted"> Kurgusal Aster Mobility politikalarını keşfedin </span>
              </div>
              <div className="examples-grid">
                {examples.slice(0, 3).map((e, i) => (
                  <button
                    className="example-card"
                    key={e.id}
                    onClick={() => {
                      setQuery(e.question);
                      navigate('ask');
                    }}
                  >
                    <span className="example-number">
                      0{i + 1} <Tag>{categoryNames[e.category] || e.category}</Tag>
                    </span>
                    <strong>{e.question}</strong>
                    <ArrowUpRight size={19} />
                  </button>
                ))}
              </div>
            </>
          )}
          {page === 'ask' && (
            <Ask
              status={status}
              examples={examples}
              initialQuery={query}
              onSource={openSource}
              onComplete={refresh}
            />
          )}
          {page === 'experiments' && <Evaluations runs={runs} />}
          {page === 'knowledge' && (
            <Knowledge documents={documents} status={status} onSource={openSource} />
          )}
          {page === 'decisions' && <Decisions />}
          {page === 'overview' && (
            <section className="panel recent-panel">
              <div className="panel-heading">
                <div>
                  <h2> Son isteklerin trace kayıtları </h2>
                  <p>
                    {' '}
                    Ziyaretçi soruları ve kaynak içerikleri genel telemetry kayıtlarına
                    yazılmaz.{' '}
                  </p>
                </div>
                <Tag>{metrics?.total || 0} İSTEK </Tag>
              </div>
              {metrics?.requests.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th> İstek </th>
                        <th> Yanıt türü </th>
                        <th> Sağlayıcı </th>
                        <th>Retrieval</th>
                        <th> Süre </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.requests.slice(0, 5).map((r) => (
                        <tr key={r.id}>
                          <td>
                            <code>{r.id.slice(0, 8)}</code>
                            <small>{new Date(r.createdAt).toLocaleTimeString('tr-TR')}</small>
                          </td>
                          <td>
                            <Tag tone={r.mode === 'live' ? 'green' : 'neutral'}>
                              {modeName[r.mode]}
                            </Tag>
                          </td>
                          <td>{r.provider}</td>
                          <td>{r.retrievalMode}</td>
                          <td>
                            <code>{time(r.durationMs)}</code>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              onClick={() => setTrace(r)}
                              aria-label={`Trace kaydını incele ${r.id.slice(0, 8)}`}
                            >
                              <ArrowUpRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state compact">
                  <Activity size={24} />
                  <strong> İlk trace kaydı bir soruyla başlar. </strong>
                  <span>
                    {' '}
                    Bu alan gerçek isteklerle güncellenir. Başlamak için bir soru sorun.{' '}
                  </span>
                </div>
              )}
            </section>
          )}
          {page === 'reviews' && <ReviewWorkbench />}
          {page === 'content' && <ContentWorkbench />}
          <footer className="footer">
            <span> RAGNA / 0.3.0 </span>
            <span>
              Serkan Azeri tarafından geliştirildi <span className="footer-dot">·</span> Sentetik
              veri. Şeffaf değerlendirme.{' '}
            </span>
            <span>{status?.corpusVersion || 'Veri kümesi yükleniyor'}</span>
          </footer>
        </main>
      </div>
      {(source || trace) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setSource(null);
            setTrace(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={source ? 'Kaynak belge' : 'İstek trace kaydı'}
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Pencereyi kapat"
              onClick={() => {
                setSource(null);
                setTrace(null);
              }}
              autoFocus
            >
              <X size={20} />
            </button>
            {source ? (
              <>
                <div className="eyebrow"> KAYNAK BELGE · SENTETİK </div>
                <h2>{source.title}</h2>
                <div className="source-meta">
                  <Tag>v{source.version}</Tag>
                  <Tag>{source.effectiveDate}</Tag>
                  <Tag>{departmentNames[source.department] || source.department}</Tag>
                </div>
                {source.sections.map((s) => (
                  <article key={s.heading}>
                    <h3>{s.heading}</h3>
                    <p>{s.text}</p>
                  </article>
                ))}
              </>
            ) : (
              trace && (
                <>
                  <div className="eyebrow"> İSTEK TRACE KAYDI </div>
                  <h2>
                    <code>{trace.id.slice(0, 8)}</code>
                  </h2>
                  <p>
                    {trace.provider} · {time(trace.durationMs)} · {modeName[trace.mode]}
                  </p>
                  <TraceView spans={trace.spans} />
                  {trace.fallbackReason && (
                    <div className="notice"> Fallback nedeni: {trace.fallbackReason}</div>
                  )}
                </>
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}
function Ask({
  status,
  examples,
  initialQuery,
  onSource,
  onComplete,
}: {
  status: Status | null;
  examples: Example[];
  initialQuery: string;
  onSource: (id: string) => void;
  onComplete: () => void;
}) {
  const [question, setQuestion] = useState(initialQuery);
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [asked, setAsked] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guided, setGuided] = useState(false);
  const [feedback, setFeedback] = useState<number | null>(null);
  const [token, setToken] = useState('');
  const captcha = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    if (!status?.turnstileSiteKey) return;
    let active = true;
    const render = () => {
      if (active && captcha.current && window.turnstile)
        widget.current = window.turnstile.render(captcha.current, {
          sitekey: status.turnstileSiteKey,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(''),
        });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      active = false;
      if (widget.current) window.turnstile?.remove(widget.current);
    };
  }, [status?.turnstileSiteKey]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setLoading(true);
    setError('');
    setFeedback(null);
    setAsked(question.trim());
    setAnswer(null);
    try {
      setAnswer(
        await api<ChatResponse>('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question.trim(), guided, turnstileToken: token }),
        }),
      );
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İstek tamamlanamadı');
    } finally {
      setLoading(false);
      if (widget.current) {
        window.turnstile?.reset(widget.current);
        setToken('');
      }
    }
  };
  const rate = async (value: number) => {
    if (!answer) return;
    try {
      await api('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: answer.requestId, rating: value }),
      });
      setFeedback(value);
    } catch {
      setError('Geri bildirim kaydedilemedi.');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"> KAYNAKLARDAN YANITA </div>
          <h1> Sorun. İnceleyin. Anlayın. </h1>
          <p> Kurgusal politikalar hakkında sorun; yanıtı kaynaklarıyla birlikte inceleyin. </p>
        </div>
        <Tag tone="green">
          <ShieldCheck size={13} /> Herkese açık kaynaklar{' '}
        </Tag>
      </div>
      <div className="chat-layout">
        <aside className="question-library" aria-label="Örnek sorular">
          <h3> Örnek sorular </h3>
          <p> Bir senaryo seçin veya kendi sorunuzu yazın. </p>
          {examples.map((e) => (
            <button
              key={e.id}
              className={question === e.question ? 'selected' : ''}
              onClick={() => setQuestion(e.question)}
            >
              <Tag>{categoryNames[e.category] || e.category}</Tag>
              <span>{e.question}</span>
              <ArrowUpRight size={14} />
            </button>
          ))}
          <div className="library-note">
            <CircleHelp size={17} />
            <p>
              Tüm politikalar kurgusal bir şirkete aittir. Kişisel veya gizli bilgi girmeyin.
              Kaynaklı yanıtlar 24 saat sunucu cache'inde tutulabilir.{' '}
            </p>
          </div>
        </aside>
        <section className="chat-workspace">
          <div className="chat-toolbar">
            <span>
              <span className="small-logo">r</span> Ragna asistanı{' '}
            </span>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={guided}
                onChange={(e) => setGuided(e.target.checked)}
              />{' '}
              Kayıtlı örneği göster{' '}
            </label>
          </div>
          <div className="chat-body" aria-live="polite">
            {!asked ? (
              <div className="empty-state chat-empty">
                <div className="orb">
                  <Search size={30} />
                </div>
                <h2> İyi yanıtlar güvenilir kaynaklarla başlar. </h2>
                <p>
                  Önce geçerli cache yanıtı aranır. Yeni yanıtlarda kaynakları ve işlem adımlarını
                  inceleyebilirsiniz. Model erişilemezse kaynak alıntıları açıkça belirtilir.{' '}
                </p>
                <div className="capability-row">
                  <span>
                    <BookOpen size={14} />
                    Kaynak atıfları{' '}
                  </span>
                  <span>
                    <GitBranch size={14} />
                    İstek trace kayıtları{' '}
                  </span>
                  <span>
                    <ShieldCheck size={14} />
                    Erişim sınırları{' '}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="user-question">
                  <span> SİZ </span>
                  <p>{asked}</p>
                </div>
                {loading && (
                  <div className="loading-answer">
                    <span className="spinner" />
                    <div>
                      Cache kontrol ediliyor, kaynaklar ve yanıt doğrulanıyor{' '}
                      <small> Yeni yanıt üretimi birkaç saniye sürebilir. </small>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="notice warning" role="alert">
                    {error}
                  </div>
                )}
                {answer && (
                  <div className="answer">
                    <div className="answer-heading">
                      <span className="small-logo">r</span>
                      <strong>Ragna</strong>
                      <Tag tone={answer.mode === 'live' ? 'green' : 'amber'}>
                        {modeName[answer.mode]}
                      </Tag>
                      <span>{time(answer.durationMs)}</span>
                    </div>
                    {answer.mode !== 'live' && (
                      <div className="mode-explainer">
                        {answer.mode === 'cached'
                          ? 'Bu yanıt daha önce model tarafından üretildi. Güncel kaynakları doğrulandı ve cache üzerinden sunuldu; bu istekte model çağrılmadı.'
                          : answer.mode === 'guided'
                            ? 'Bu yanıt kaynaklara dayalı, önceden hazırlanmış bir referans örnektir. Bu istekte model çağrılmadı.'
                            : answer.mode === 'evidence'
                              ? 'Canlı yanıt üretimi kullanılamıyor. Aşağıda bulunan kaynaklardan alıntılar gösteriliyor.'
                              : 'Mevcut bilgilerle güvenilir bir yanıt verilemiyor. Ayrıntılar için trace kaydını inceleyin.'}
                      </div>
                    )}
                    <div className="answer-text">{answer.answer}</div>
                    {answer.cache && (
                      <p className="cache-meta">
                        Üretim: {new Date(answer.cache.createdAt).toLocaleString('tr-TR')} ·{' '}
                        {answer.cache.originalProvider} · Geçerlilik:{' '}
                        {new Date(answer.cache.expiresAt).toLocaleString('tr-TR')}
                      </p>
                    )}
                    {answer.citations.length > 0 && (
                      <>
                        <div className="source-label">
                          YANITI DESTEKLEYEN KAYNAKLAR <span>{answer.citations.length}</span>
                        </div>
                        <div className="citations">
                          {answer.citations.map((c) => (
                            <button key={c.id} onClick={() => onSource(c.documentId)}>
                              <span className="citation-id">{c.id}</span>
                              <div>
                                <strong>{c.title}</strong>
                                <small>
                                  {c.heading} · v{c.version}
                                </small>
                              </div>
                              <ArrowUpRight size={15} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <details className="trace-details">
                      <summary>
                        <GitBranch size={15} /> İstek ayrıntılarını incele{' '}
                        <code>{answer.requestId.slice(0, 8)}</code>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="trace-summary">
                        <Tag>{answer.provider}</Tag>
                        <Tag>{answer.retrievalMode}</Tag>
                        <Tag>{answer.model || 'Model kullanılmadı'}</Tag>
                      </div>
                      <TraceView spans={answer.spans} />
                      {answer.fallbackReason && (
                        <p className="muted">Fallback: {answer.fallbackReason}</p>
                      )}
                      <p className="muted">
                        Atıf doğrulaması kaynak kimliklerini denetler. Yanıtın anlam bakımından
                        kaynakla tutarlılığı ayrıca değerlendirilmelidir.{' '}
                      </p>
                    </details>
                    <div className="answer-actions">
                      <span> Bu yanıt yararlı mıydı? </span>
                      <button
                        aria-label="Yararlı"
                        className={`icon-button ${feedback === 1 ? 'chosen' : ''}`}
                        onClick={() => rate(1)}
                      >
                        <ThumbsUp size={15} />
                      </button>
                      <button
                        aria-label="Yararlı değil"
                        className={`icon-button ${feedback === -1 ? 'chosen' : ''}`}
                        onClick={() => rate(-1)}
                      >
                        <ThumbsDown size={15} />
                      </button>
                      <button
                        className="trace-export"
                        onClick={() => download(answer, `ragna-${answer.requestId}.json`)}
                      >
                        <ArrowDownToLine size={14} /> Trace kaydını indir{' '}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="question">
              Sorunuz{' '}
            </label>
            <textarea
              id="question"
              placeholder="İade, garanti veya destek hakkında sorunuzu yazın…"
              value={question}
              maxLength={1500}
              rows={2}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-bottom">
              <span> Enter: gönder · Shift + Enter: yeni satır </span>
              <button
                className="button primary"
                disabled={
                  loading ||
                  question.trim().length < 3 ||
                  Boolean(status?.turnstileSiteKey && !token)
                }
                type="submit"
              >
                {loading ? 'Hazırlanıyor…' : "Ragna'ya sor"}
                <Send size={15} />
              </button>
            </div>
            <p className="composer-note">
              Kişisel veya gizli bilgi girmeyin. Kaynaklı yanıtlar 24 saat sunucu cache’inde
              saklanabilir.
            </p>
            <div ref={captcha} />
          </form>
        </section>
      </div>
    </>
  );
}

function CloudResults() {
  return (
    <section className="panel cloud-results">
      <div className="panel-heading">
        <div>
          <h2> Cloudflare üzerinde ölçüldü </h2>
          <p>
            Aynı 60 sentetik soru · aynı bölüm chunk'ları ·{' '}
            {new Date(cloudEvaluation.publishedAt).toLocaleDateString('tr-TR')}
          </p>
        </div>
        <button
          className="text-button"
          onClick={() => download(cloudEvaluation, 'ragna-cloud-retrieval.json')}
        >
          <ArrowDownToLine size={15} /> Kanıtlar{' '}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Retrieval</th>
              <th>Recall @ 5</th>
              <th>Held-out recall</th>
              <th>nDCG @ 5</th>
              <th>Retrieval p95</th>
              <th> Erişim ihlalleri </th>
            </tr>
          </thead>
          <tbody>
            {cloudEvaluation.runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.label}</strong>
                  <small>{r.holdoutMetrics.questions} holdout sorusu </small>
                </td>
                <td>{percent(r.metrics.recallAt5)}</td>
                <td>{percent(r.holdoutMetrics.recallAt5)}</td>
                <td>{r.metrics.ndcgAt5.toFixed(3)}</td>
                <td>{time(r.metrics.p95Ms)}</td>
                <td>
                  <Tag tone="green">{r.metrics.accessLeaks}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-foot">
        <CircleHelp size={14} /> Bu ölçüm retrieval kalitesini gösterir. Yanıt doğruluğunu veya
        üretim trafiği performansını ölçmez.{' '}
      </div>
    </section>
  );
}
function Evaluations({ runs }: { runs: EvalRun[] }) {
  const [selected, setSelected] = useState('lexical-sections-450');
  const [category, setCategory] = useState('all');
  const run = runs.find((r) => r.id === selected) || runs[0];
  const results = run?.results.filter((r) => category === 'all' || r.category === category) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"> ÖLÇ → KARŞILAŞTIR → KARAR VER </div>
          <h1> Kararlarınızı ölçümlerle destekleyin. </h1>
          <p> Tekrarlanabilir retrieval deneyleri ve sonuçların açıkça belirtilen sınırları. </p>
        </div>
        <button className="button" onClick={() => download(runs, 'ragna-evaluations.json')}>
          <ArrowDownToLine size={16} /> Sonuçları indir{' '}
        </button>
      </div>
      <section className="panel lab-panel">
        <h2>CI kalite kontrolü: {qualityReport.passed ? 'Başarılı' : 'Başarısız'}</h2>
        <p>
          Recall/nDCG toleransı: {qualityReport.tolerance * 100} yüzde puan · erişim sızıntısı
          toleransı: 0
        </p>
        <p>
          {qualityReport.changes.length} soru/yapılandırma sonucu değişti. Son kontrol:{' '}
          {new Date(qualityReport.checkedAt).toLocaleString('tr-TR')}
        </p>
        <details>
          <summary>Soru bazında farklar ve kontrol raporu</summary>
          <pre>{JSON.stringify(qualityReport, null, 2)}</pre>
        </details>
      </section>
      <CloudResults />
      <div className="notice">
        <FlaskConical size={19} />
        <span>
          <strong> Offline lexical benchmark. </strong> Bu deneyler sentetik veri üzerinde bellek
          içi retrieval ölçer. Buluttaki hybrid retrieval ve üretilen yanıtların doğruluğu ayrı
          değerlendirilir. Veri kümesi insan incelemesinden geçmemiştir.{' '}
        </span>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2> Yapılandırmaları karşılaştırın </h2>
            <p> Üç deneyde de aynı veri kümesi ve sorular kullanılır. </p>
          </div>
          <Tag>RECALL @ 5</Tag>
        </div>
        <div className="table-scroll">
          <table className="eval-table">
            <thead>
              <tr>
                <th> Yapılandırma </th>
                <th>Recall @ 5</th>
                <th>MRR</th>
                <th>nDCG @ 5</th>
                <th> Erişim ihlalleri </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={run?.id === r.id ? 'selected-row' : ''}>
                  <td>
                    <strong>{r.strategy === 'sections' ? 'Bölüm tabanlı' : 'Sabit pencere'}</strong>
                    <small>{r.chunkSize} tahmini token · %10 overlap </small>
                  </td>
                  <td>
                    <div className="inline-score">
                      <span>{percent(r.metrics.recallAt5)}</span>
                      <i style={{ width: `${r.metrics.recallAt5 * 80}px` }} />
                    </div>
                  </td>
                  <td>
                    <code>{r.metrics.mrr.toFixed(3)}</code>
                  </td>
                  <td>
                    <code>{r.metrics.ndcgAt5.toFixed(3)}</code>
                  </td>
                  <td>
                    <Tag tone={r.metrics.accessLeaks ? 'amber' : 'green'}>
                      {r.metrics.accessLeaks}
                    </Tag>
                  </td>
                  <td>
                    <button className="text-button" onClick={() => setSelected(r.id)}>
                      İncele <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {run && (
        <>
          <div className="section-title">
            <h2> Soru bazında sonuçlar </h2>
            <select
              aria-label="Senaryoyu filtrele"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all"> Tüm senaryolar </option>
              {[
                'single-hop',
                'multi-hop',
                'temporal',
                'unanswerable',
                'access-control',
                'adversarial',
              ].map((c) => (
                <option key={c} value={c}>
                  {categoryNames[c] || c}
                </option>
              ))}
            </select>
          </div>
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th> Soru kimliği </th>
                  <th> Senaryo </th>
                  <th>Split</th>
                  <th>Recall</th>
                  <th> Bulunan belgeler </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.questionId}>
                    <td>
                      <code>{r.questionId}</code>
                    </td>
                    <td>
                      <Tag>{categoryNames[r.category] || r.category}</Tag>
                    </td>
                    <td>{r.split}</td>
                    <td>
                      {r.recall === null ? (
                        <span className="muted"> Uygulanamaz </span>
                      ) : (
                        percent(r.recall)
                      )}
                    </td>
                    <td className="retrieved-ids">{r.retrievedIds.join(', ') || 'Yok'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice">
            <CircleHelp size={18} />
            <span>
              Yanıtlanamayan sorular için retrieval recall hedefi yoktur. Yanıt vermekten kaçınma
              davranışı, model üretiminde ayrıca ölçülür.{' '}
            </span>
          </div>
          <p className="hash-line">
            VERİ KÜMESİ SHA256 <code>{run.datasetHash}</code>
          </p>
        </>
      )}
    </>
  );
}
function Knowledge({
  documents,
  status,
  onSource,
}: {
  documents: DocumentSummary[];
  status: Status | null;
  onSource: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = documents.filter((d) =>
    `${d.title} ${departmentNames[d.department] || d.department}`
      .toLocaleLowerCase('tr')
      .includes(search.toLocaleLowerCase('tr')),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"> BİLGİ KATMANI </div>
          <h1> Sisteminizin kaynaklarını tanıyın. </h1>
          <p>
            {' '}
            Sürümlenmiş politikalar, belirli erişim sınırları ve incelenebilir kaynak
            metinleri.{' '}
          </p>
        </div>
        <Tag> SENTETİK · ASTER MOBILITY </Tag>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Açık belgeler"
          value={String(documents.length)}
          detail="Yalnızca güncel sürümler"
          icon={<FileText size={16} />}
        />
        <Metric
          label="Aranabilir chunk'lar"
          value={String(status?.chunkCount || '—')}
          detail="Herkese açık kaynaklar"
          icon={<Layers3 size={16} />}
        />
        <Metric
          label="Retrieval yöntemi"
          value={status?.retrieval === 'hybrid' ? 'Hybrid' : 'Lexical'}
          detail={status?.embedding || 'Vektör index bağlı değil'}
          icon={<Search size={16} />}
        />
        <Metric
          label="Verinin kökeni"
          value="100%"
          detail="Kurgusal, sürüm kontrollü politikalar"
          icon={<ShieldCheck size={16} />}
        />
      </div>
      <div className="section-title">
        <h2> Kaynak listesi </h2>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Kaynak belgelerde ara"
            placeholder="Belgelerde ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="document-grid">
        {filtered.map((d) => (
          <button className="document-card" onClick={() => onSource(d.id)} key={d.id}>
            <div className="document-top">
              <span className="doc-icon">
                <FileText size={22} />
              </span>
              <Tag tone="green"> Güncel </Tag>
            </div>
            <h3>{d.title}</h3>
            <p>{departmentNames[d.department] || d.department}</p>
            <div className="document-bottom">
              <span>
                v{d.version} · {d.effectiveDate}
              </span>
              <span>
                {d.chunkCount} chunks <ArrowUpRight size={15} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Search />
          <strong> Eşleşen belge bulunamadı. </strong>
        </div>
      )}
      <div className="notice">
        <ShieldCheck size={18} />
        <span>
          Arşivlenmiş ve kurum içi belgeler retrieval öncesinde filtrelenir. Ziyaretçiler prompt ile
          erişim kapsamını değiştiremez.{' '}
        </span>
      </div>
    </>
  );
}
function Decisions() {
  const notes = [
    [
      '01',
      'Erişilebilirlik ürünün bir parçasıdır',
      'Bulutta bağımsız, yerelde isteğe bağlı.',
      "Canlı demo bilgisayar kapalıyken de Cloudflare üzerinde çalışır. Workers AI ana model sağlayıcısıdır. OpenRouter isteğe bağlıdır; mevcut kurulum için gerekli değildir. Yerel Open WebUI aynı RAG API'sine bağlanır. Geçerli cache yanıtı model çağrısı yapmadan sunulur; yeni yanıt üretilemezse kaynak alıntıları gösterilir.",
    ],
    [
      '02',
      'Embedding seçimi bir dağıtım kararıdır',
      'Buluttaki tercih: BGE-M3.',
      'Workers AI üzerindeki çok dilli model, belge ve sorgu vektörlerini aynı embedding uzayında üretir. Vectorize 1024 boyut kullanır. EmbeddingGemma karşılaştırma adayıdır; aynı koşullarda ölçüm yapılmadan modeller arasında üstünlük iddiası yoktur.',
    ],
    [
      '03',
      'Chunk sınırları bulunan kanıtı değiştirir',
      'Bölüm tabanlı ve sabit pencereleri karşılaştırın.',
      'Kaynak başlıkları, sürümler ve bölüm bilgisi korunur. 250/450 tahmini token içeren bölüm pencereleri, 450 token sabit baseline ile karşılaştırılır. Tercih edilen stratejiyi desteklemeyen sonuçlar da yayımlanır. Token sayıları yaklaşık değerlerdir.',
    ],
    [
      '04',
      'Sentetik veri bir başlangıçtır',
      'Üretilen adaylar otomatik referans kabul edilmez.',
      'Altı senaryo türünde kaynaklardan türetilmiş 60 soru bulunur. Ayrı bir Gemma üreticisi, birebir kaynak alıntısıyla birlikte inceleme bekleyen adaylar oluşturur. Kaynak kontrolü kodla yapılmıştır; insan değerlendirmesi yoktur. Bu set üretim ortamındaki doğruluğu kanıtlamaz.',
    ],
    [
      '05',
      'Kaynak kimliği, doğruluk puanı değildir',
      'Doğruladığınız özelliği ölçün.',
      'Çalışma anında atıfların izin verilen kaynaklara ait olduğu denetlenir. Bu kontrol iddiaların kaynak tarafından desteklendiğini tek başına kanıtlamaz. Anlamsal tutarlılık ve insan değerlendirmesine dayalı doğruluk ayrı inceleme gerektirir.',
    ],
    [
      '06',
      'Bütçeler ve cache açık sınırlar gerektirir',
      'Önce cache, sonra model rezervasyonu.',
      "Güncel, kaynaklı ve herkese açık yanıtlar 24 saat saklanır. Cache anahtarı soru, corpus hash ve model yapılandırmasını içerir. İç erişim kapsamı cache'e alınmaz. Cache hit model kotası tüketmez; günlük model rezervasyonu Durable Object ile yönetilir. Rezervasyon tutarı gerçek fatura değildir.",
    ],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"> TERCİHLERİN ARKASINDAKİ GEREKÇELER </div>
          <h1> Mühendislik, kararları açıklayabilmektir. </h1>
          <p> Uygulamanın arkasındaki varsayımlar, ödünleşimler ve ölçüm sınırları. </p>
        </div>
        <a
          className="button"
          href="https://github.com/serkanazeri/ragna#mühendislik-kararları"
          target="_blank"
          rel="noreferrer"
        >
          README'yi okuyun <ExternalLink size={15} />
        </a>
      </div>
      <div className="decisions-list">
        {notes.map(([number, title, subtitle, body]) => (
          <article className="decision" key={number}>
            <span className="decision-number">{number}</span>
            <div>
              <span className="eyebrow"> MİMARİ KARAR </span>
              <h2>{title}</h2>
              <h3>{subtitle}</h3>
              <p>{body}</p>
            </div>
            <GitBranch size={22} />
          </article>
        ))}
      </div>
    </>
  );
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
function PwaTools() {
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches,
  );
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const available = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setInstall(null);
    };
    const failure = () => setFailed(true);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', complete);
    window.addEventListener('pwa-registration-failed', failure);
    let mounted = true;
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.ready.then(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', complete);
      window.removeEventListener('pwa-registration-failed', failure);
    };
  }, []);
  return (
    <>
      {!online && (
        <div className="offline-banner" role="status">
          Çevrimdışısınız. Uygulama arayüzü ve kayıtlı değerlendirmeler kullanılabilir. Sunucu cache
          yanıtları ve yeni sorular için internet bağlantısı gerekir.
        </div>
      )}
      <div className="pwa-tools">
        {!installed && (
          <button
            className="button"
            onClick={async () => {
              if (!install) {
                setHelp(!help);
                return;
              }
              await install.prompt();
              await install.userChoice;
              setInstall(null);
            }}
          >
            <ArrowDownToLine size={16} />
            Uygulamayı yükle
          </button>
        )}
        <small>
          {failed
            ? 'Çevrimdışı hazırlık tamamlanamadı. Sayfayı yenileyebilirsiniz.'
            : ready
              ? 'PWA hazır · çevrimdışı arayüz'
              : 'RAGNA · web uygulaması'}
          {installed ? ' · Yüklendi' : ''}
        </small>
      </div>
      {help && (
        <div className="notice" role="status">
          Chrome veya Edge menüsünden “Uygulamayı yükle” seçeneğini kullanın. iPhone/iPad Safari’de
          Paylaş → Ana Ekrana Ekle yolunu izleyin. Kurulum seçeneği tarayıcı desteğine bağlıdır.
        </div>
      )}
    </>
  );
}
