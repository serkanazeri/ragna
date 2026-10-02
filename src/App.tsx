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

type Page = 'overview' | 'ask' | 'experiments' | 'knowledge' | 'decisions';
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
};
type Metrics = {
  budget: {
    reservedUsd: number;
    dailyLimitUsd: number;
    requests: number;
    dailyRequestLimit: number;
  };
  total: number;
  live: number;
  guided: number;
  evidence: number;
  abstained: number;
  p50Ms: number | null;
  p95Ms: number | null;
  fallbackRate: number | null;
  reportedCostUsd: number | null;
  costCoverage: number | null;
  positiveFeedback: number | null;
  feedbackCount: number;
  requests: Trace[];
  truncated: boolean;
};
type DocumentSummary = Omit<SourceDocument, 'sections'> & { sections: number; chunkCount: number };
type Example = { id: string; question: string; category: string };
const percent = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);
const time = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
const modeName: Record<string, string> = {
  live: 'Live model',
  guided: 'Recorded example',
  evidence: 'Evidence only',
  abstained: 'Abstained',
};
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(path, options);
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || 'Request failed');
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
      api<Metrics>('/api/metrics').then(setMetrics),
    ]).catch((e) => setLoadError(e.message));
  useEffect(() => {
    Promise.all([
      refresh(),
      api<{ runs: EvalRun[] }>('/api/evaluations').then((r) => setRuns(r.runs)),
      api<{ documents: DocumentSummary[] }>('/api/corpus').then((r) => setDocuments(r.documents)),
      api<Example[]>('/api/examples').then(setExamples),
    ]).catch((e) => setLoadError(e.message));
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);
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
    ['overview', 'Overview', <LayoutDashboard size={18} />],
    ['ask', 'Ask Ragna', <MessageSquare size={18} />],
    ['experiments', 'Evaluations', <FlaskConical size={18} />],
    ['knowledge', 'Knowledge base', <Database size={18} />],
    ['decisions', 'Engineering notes', <GitBranch size={18} />],
  ];
  const cloud = cloudEvaluation.runs.find((r) => r.id === 'cloud-hybrid')!;
  const liveReady = status && Object.values(status.providers).some(Boolean);
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
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
            Aster Mobility<small>Reference workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WORKBENCH</p>
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
            <ShieldCheck size={16} /> Built on evidence
          </div>
          <p>
            Every answer has a source.
            <br />
            Every decision has a reason.
          </p>
          <span>FICTIONAL CORPUS · REAL MEASUREMENTS</span>
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
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{items.find((i) => i[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="system-state">
              <i className={`dot ${liveReady ? 'ok' : ''}`} />
              {liveReady ? 'Cloud inference configured' : 'Evidence preview'}
            </span>
            <a
              href="https://github.com/serkanazeri/ragna"
              target="_blank"
              rel="noreferrer"
              className="repo-link"
            >
              <Code2 size={16} /> Source <ArrowUpRight size={13} />
            </a>
          </div>
        </header>
        <main>
          {loadError && (
            <div className="notice warning" role="alert">
              Connection notice: {loadError}
              <button
                onClick={() => {
                  setLoadError('');
                  refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {page === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <i /> RAG ENGINEERING WORKBENCH
                  </div>
                  <h1>Evidence before answers.</h1>
                  <p>Understand what your RAG system knows. Measure how well it delivers.</p>
                </div>
                <button className="button primary" onClick={() => navigate('ask')}>
                  Ask a question <ArrowUpRight size={16} />
                </button>
              </div>
              <section className="hero-panel">
                <div className="hero-copy">
                  <Tag tone="light">01 / THE REFERENCE PROJECT</Tag>
                  <h2>
                    From a question
                    <br />
                    to a defensible answer.
                  </h2>
                  <p>
                    A production-minded RAG lab for a fictional service business. Inspect the
                    sources, challenge the retrieval, and trace every response.
                  </p>
                  <button className="text-link" onClick={() => navigate('decisions')}>
                    Explore the engineering decisions <ArrowRight size={16} />
                  </button>
                </div>
                <div className="flow-visual">
                  <div className="flow-node">
                    <MessageSquare size={18} />
                    <span>
                      Question<small>Intent & access scope</small>
                    </span>
                    <span className="flow-num">01</span>
                  </div>
                  <div className="flow-line" />
                  <div className="flow-node">
                    <Search size={18} />
                    <span>
                      Evidence<small>Retrieve · rank · verify access</small>
                    </span>
                    <span className="flow-num">02</span>
                  </div>
                  <div className="flow-line" />
                  <div className="flow-node final">
                    <Sparkles size={18} />
                    <span>
                      Answer + sources<small>Validate citations · record trace</small>
                    </span>
                    <Check size={16} />
                  </div>
                </div>
              </section>
              <div className="section-title">
                <h2>Measured, not assumed</h2>
                <Tag>DEPLOYED HYBRID · SYNTHETIC BENCHMARK</Tag>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="Recall @ 5"
                  value={percent(cloud.metrics.recallAt5)}
                  detail="54 answerable synthetic questions"
                  icon={<Search size={16} />}
                />
                <Metric
                  label="Ranking quality"
                  value={cloud.metrics.ndcgAt5.toFixed(3)}
                  detail="nDCG @ 5 · deployed hybrid"
                  icon={<Layers3 size={16} />}
                />
                <Metric
                  label="Access leaks"
                  value={String(cloud.metrics.accessLeaks)}
                  detail="Across the fixed regression set"
                  icon={<ShieldCheck size={16} />}
                />
                <Metric
                  label="Evaluation questions"
                  value={String(status?.questionCount || '—')}
                  detail="6 scenario types · TR + EN"
                  icon={<FlaskConical size={16} />}
                />
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>The retrieval experiment</h2>
                      <p>Offline baseline · different chunking decisions.</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Open evaluations"
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
                            {r.strategy === 'sections' ? 'Section-aware' : 'Fixed window'}{' '}
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
                    <CircleHelp size={14} /> Synthetic benchmark. Cloud hybrid quality is measured
                    separately.
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Live operations</h2>
                      <p>Last 24 hours · real requests only</p>
                    </div>
                    <Activity size={18} />
                  </div>
                  <div className="operational-grid">
                    <div>
                      <span>Requests</span>
                      <strong>{metrics?.total ?? '—'}</strong>
                    </div>
                    <div>
                      <span>Response p95</span>
                      <strong>{time(metrics?.p95Ms)}</strong>
                    </div>
                    <div>
                      <span>Live answers</span>
                      <strong>{metrics?.live ?? '—'}</strong>
                    </div>
                    <div>
                      <span>Reported model cost</span>
                      <strong>
                        {metrics?.reportedCostUsd != null
                          ? `$${metrics.reportedCostUsd.toFixed(4)}`
                          : '—'}
                      </strong>
                    </div>
                  </div>
                  <div className="operational-grid secondary-operations">
                    <div>
                      <span>Fallback rate</span>
                      <strong>{percent(metrics?.fallbackRate)}</strong>
                    </div>
                    <div>
                      <span>Helpful feedback</span>
                      <strong>{percent(metrics?.positiveFeedback)}</strong>
                    </div>
                    <div>
                      <span>Cost reporting coverage</span>
                      <strong>{percent(metrics?.costCoverage)}</strong>
                    </div>
                    <div>
                      <span>Daily reservation / cap</span>
                      <strong>
                        {metrics?.budget
                          ? `$${metrics.budget.reservedUsd.toFixed(2)} / $${metrics.budget.dailyLimitUsd.toFixed(2)}`
                          : '—'}
                      </strong>
                    </div>
                  </div>
                  <div className="panel-foot">
                    <Clock3 size={14} />
                    {metrics?.total
                      ? 'Includes retrieval and validated response generation.'
                      : 'Send a question to start collecting telemetry.'}
                  </div>
                </section>
              </div>
              <div className="section-title">
                <h2>Start with a real challenge</h2>
                <span className="muted">Explore the fictional Aster Mobility policies</span>
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
                      0{i + 1} <Tag>{e.category}</Tag>
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
                  <h2>Recent request traces</h2>
                  <p>Source content and visitor questions are not stored in public telemetry.</p>
                </div>
                <Tag>{metrics?.total || 0} REQUESTS</Tag>
              </div>
              {metrics?.requests.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Request</th>
                        <th>Response mode</th>
                        <th>Provider</th>
                        <th>Retrieval</th>
                        <th>Duration</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.requests.slice(0, 5).map((r) => (
                        <tr key={r.id}>
                          <td>
                            <code>{r.id.slice(0, 8)}</code>
                            <small>{new Date(r.createdAt).toLocaleTimeString()}</small>
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
                              aria-label={`Inspect trace ${r.id.slice(0, 8)}`}
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
                  <strong>Your first trace starts with a question.</strong>
                  <span>No fabricated activity. Try the workbench to populate this view.</span>
                </div>
              )}
            </section>
          )}
          <footer className="footer">
            <span>RAGNA / 0.1.0</span>
            <span>
              Built by Serkan Azeri <span className="footer-dot">·</span> Synthetic data.
              Transparent evaluation.
            </span>
            <span>{status?.corpusVersion || 'Loading corpus'}</span>
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
            aria-label={source ? 'Source document' : 'Request trace'}
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
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
                <div className="eyebrow">SOURCE DOCUMENT · SYNTHETIC</div>
                <h2>{source.title}</h2>
                <div className="source-meta">
                  <Tag>v{source.version}</Tag>
                  <Tag>{source.effectiveDate}</Tag>
                  <Tag>{source.department}</Tag>
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
                  <div className="eyebrow">REQUEST TRACE</div>
                  <h2>
                    <code>{trace.id.slice(0, 8)}</code>
                  </h2>
                  <p>
                    {trace.provider} · {time(trace.durationMs)} · {modeName[trace.mode]}
                  </p>
                  <TraceView spans={trace.spans} />
                  {trace.fallbackReason && (
                    <div className="notice">Fallback reason: {trace.fallbackReason}</div>
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
      setError(e instanceof Error ? e.message : 'Request failed');
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
      setError('Feedback could not be saved.');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE EVIDENCE WORKBENCH</div>
          <h1>Ask. Inspect. Understand.</h1>
          <p>Explore the fictional policies in Turkish or English.</p>
        </div>
        <Tag tone="green">
          <ShieldCheck size={13} /> Public access scope
        </Tag>
      </div>
      <div className="chat-layout">
        <aside className="question-library">
          <h3>A question worth asking</h3>
          <p>Choose a scenario or write your own.</p>
          {examples.map((e) => (
            <button
              key={e.id}
              className={question === e.question ? 'selected' : ''}
              onClick={() => setQuestion(e.question)}
            >
              <Tag>{e.category}</Tag>
              <span>{e.question}</span>
              <ArrowUpRight size={14} />
            </button>
          ))}
          <div className="library-note">
            <CircleHelp size={17} />
            <p>
              All policies belong to a fictional company. Do not enter personal or confidential
              information.
            </p>
          </div>
        </aside>
        <section className="chat-workspace">
          <div className="chat-toolbar">
            <span>
              <span className="small-logo">r</span> Ragna assistant
            </span>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={guided}
                onChange={(e) => setGuided(e.target.checked)}
              />{' '}
              Recorded walkthrough
            </label>
          </div>
          <div className="chat-body" aria-live="polite">
            {!asked ? (
              <div className="empty-state chat-empty">
                <div className="orb">
                  <Search size={30} />
                </div>
                <h2>Good answers start with good evidence.</h2>
                <p>
                  Every result includes its source context and a trace you can inspect. When live
                  inference is unavailable, you'll see clearly labeled evidence.
                </p>
                <div className="capability-row">
                  <span>
                    <BookOpen size={14} />
                    Source citations
                  </span>
                  <span>
                    <GitBranch size={14} />
                    Request traces
                  </span>
                  <span>
                    <ShieldCheck size={14} />
                    Access boundaries
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="user-question">
                  <span>YOU</span>
                  <p>{asked}</p>
                </div>
                {loading && (
                  <div className="loading-answer">
                    <span className="spinner" />
                    <div>
                      Finding evidence and validating the response
                      <small>Cloud inference may take a few seconds.</small>
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
                        {answer.mode === 'guided'
                          ? 'This is a recorded, source-backed reference answer. No live model generated it.'
                          : answer.mode === 'evidence'
                            ? 'Live generation is unavailable. These are retrieved source excerpts, not a generated answer.'
                            : 'The available response abstains from answering. Check the trace for its origin.'}
                      </div>
                    )}
                    <div className="answer-text">{answer.answer}</div>
                    {answer.citations.length > 0 && (
                      <>
                        <div className="source-label">
                          SUPPORTING SOURCES <span>{answer.citations.length}</span>
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
                        <GitBranch size={15} /> Inspect this request{' '}
                        <code>{answer.requestId.slice(0, 8)}</code>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="trace-summary">
                        <Tag>{answer.provider}</Tag>
                        <Tag>{answer.retrievalMode}</Tag>
                        <Tag>{answer.model || 'No model'}</Tag>
                      </div>
                      <TraceView spans={answer.spans} />
                      {answer.fallbackReason && (
                        <p className="muted">Fallback: {answer.fallbackReason}</p>
                      )}
                      <p className="muted">
                        Citation validation checks identifiers. Semantic faithfulness requires a
                        separate evaluation.
                      </p>
                    </details>
                    <div className="answer-actions">
                      <span>Was this useful?</span>
                      <button
                        aria-label="Helpful"
                        className={`icon-button ${feedback === 1 ? 'chosen' : ''}`}
                        onClick={() => rate(1)}
                      >
                        <ThumbsUp size={15} />
                      </button>
                      <button
                        aria-label="Not helpful"
                        className={`icon-button ${feedback === -1 ? 'chosen' : ''}`}
                        onClick={() => rate(-1)}
                      >
                        <ThumbsDown size={15} />
                      </button>
                      <button
                        className="trace-export"
                        onClick={() => download(answer, `ragna-${answer.requestId}.json`)}
                      >
                        <ArrowDownToLine size={14} /> Export trace
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="question">
              Your question
            </label>
            <textarea
              id="question"
              placeholder="Ask about returns, warranty, support, or challenge a policy…"
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
              <span>Enter to send · Shift + Enter for a new line</span>
              <button
                className="button primary"
                disabled={
                  loading ||
                  question.trim().length < 3 ||
                  Boolean(status?.turnstileSiteKey && !token)
                }
                type="submit"
              >
                {loading ? 'Working…' : 'Ask Ragna'}
                <Send size={15} />
              </button>
            </div>
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
          <h2>Measured on Cloudflare</h2>
          <p>
            Same 60 synthetic questions · same section chunks ·{' '}
            {new Date(cloudEvaluation.publishedAt).toLocaleDateString()}
          </p>
        </div>
        <button
          className="text-button"
          onClick={() => download(cloudEvaluation, 'ragna-cloud-retrieval.json')}
        >
          <ArrowDownToLine size={15} /> Evidence
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
              <th>Access leaks</th>
            </tr>
          </thead>
          <tbody>
            {cloudEvaluation.runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.label}</strong>
                  <small>{r.holdoutMetrics.questions} held-out questions</small>
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
        <CircleHelp size={14} /> Retrieval-only measurement. This is not answer accuracy or a
        production traffic benchmark.
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
          <div className="eyebrow">MEASURE → COMPARE → DECIDE</div>
          <h1>Show your evidence.</h1>
          <p>Reproducible retrieval runs, with the limitations kept in view.</p>
        </div>
        <button className="button" onClick={() => download(runs, 'ragna-evaluations.json')}>
          <ArrowDownToLine size={16} /> Export results
        </button>
      </div>
      <CloudResults />
      <div className="notice">
        <FlaskConical size={19} />
        <span>
          <strong>Offline lexical benchmark.</strong> These runs measure in-memory retrieval on a
          synthetic fixture. Cloud hybrid retrieval and generated-answer correctness are separate
          evaluations. This dataset has not been reviewed by a human.
        </span>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Compare configurations</h2>
            <p>Same corpus and question set across all three runs.</p>
          </div>
          <Tag>RECALL @ 5</Tag>
        </div>
        <div className="table-scroll">
          <table className="eval-table">
            <thead>
              <tr>
                <th>Configuration</th>
                <th>Recall @ 5</th>
                <th>MRR</th>
                <th>nDCG @ 5</th>
                <th>Access leaks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={run?.id === r.id ? 'selected-row' : ''}>
                  <td>
                    <strong>{r.strategy === 'sections' ? 'Section-aware' : 'Fixed window'}</strong>
                    <small>{r.chunkSize} estimated tokens · 10% overlap</small>
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
                      Inspect <ArrowRight size={14} />
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
            <h2>Question-level results</h2>
            <select
              aria-label="Filter scenario"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All scenarios</option>
              {[
                'single-hop',
                'multi-hop',
                'temporal',
                'unanswerable',
                'access-control',
                'adversarial',
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Question ID</th>
                  <th>Scenario</th>
                  <th>Split</th>
                  <th>Recall</th>
                  <th>Retrieved documents</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.questionId}>
                    <td>
                      <code>{r.questionId}</code>
                    </td>
                    <td>
                      <Tag>{r.category}</Tag>
                    </td>
                    <td>{r.split}</td>
                    <td>
                      {r.recall === null ? (
                        <span className="muted">Not applicable</span>
                      ) : (
                        percent(r.recall)
                      )}
                    </td>
                    <td className="retrieved-ids">{r.retrievedIds.join(', ') || 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice">
            <CircleHelp size={18} />
            <span>
              Unanswerable questions have no retrieval recall target. Abstention is a generation
              behavior and is not inferred from this score.
            </span>
          </div>
          <p className="hash-line">
            DATASET SHA256 <code>{run.datasetHash}</code>
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
    `${d.title} ${d.department}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE KNOWLEDGE LAYER</div>
          <h1>Know what goes in.</h1>
          <p>Versioned policies, explicit access boundaries, and inspectable source text.</p>
        </div>
        <Tag>SYNTHETIC · ASTER MOBILITY</Tag>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Public documents"
          value={String(documents.length)}
          detail="Current versions only"
          icon={<FileText size={16} />}
        />
        <Metric
          label="Searchable chunks"
          value={String(status?.chunkCount || '—')}
          detail="Public access scope"
          icon={<Layers3 size={16} />}
        />
        <Metric
          label="Retrieval mode"
          value={status?.retrieval === 'hybrid' ? 'Hybrid' : 'Lexical'}
          detail={status?.embedding || 'Vector index not connected'}
          icon={<Search size={16} />}
        />
        <Metric
          label="Data provenance"
          value="100%"
          detail="Fictional, version-controlled policies"
          icon={<ShieldCheck size={16} />}
        />
      </div>
      <div className="section-title">
        <h2>Source registry</h2>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search source documents"
            placeholder="Search documents…"
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
              <Tag tone="green">Current</Tag>
            </div>
            <h3>{d.title}</h3>
            <p>{d.department}</p>
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
          <strong>No matching documents.</strong>
        </div>
      )}
      <div className="notice">
        <ShieldCheck size={18} />
        <span>
          Archived policies and internal-only documents are excluded before retrieval. Public
          visitors cannot change their access scope through a prompt.
        </span>
      </div>
    </>
  );
}
function Decisions() {
  const notes = [
    [
      '01',
      'Availability is part of the product',
      'Cloud first, local when you choose.',
      'The public demo runs on Cloudflare independently of the developer’s laptop. Workers AI is the primary generation path, with an explicitly priced OpenRouter fallback. Local Open WebUI connects to the same RAG contract. A failed provider produces a labeled evidence view, not a fabricated live answer.',
    ],
    [
      '02',
      'Embedding is a deployment decision too',
      'BGE-M3 is the cloud candidate.',
      'The multilingual model is hosted by Workers AI and can produce both document and query vectors in the same embedding space. Vectorize uses 1024 dimensions. EmbeddingGemma remains an experiment candidate; it is not claimed to be inferior without a matched evaluation.',
    ],
    [
      '03',
      'Chunk boundaries change the evidence',
      'Compare section-aware and fixed windows.',
      'The workbench preserves source titles, versions, and section provenance. It evaluates 250/450 estimated-token section windows against a 450-token fixed baseline. The baseline results are published even when they challenge the preferred strategy. Token counts here are estimates, not tokenizer-exact counts.',
    ],
    [
      '04',
      'Synthetic data is a starting point',
      'Candidates are never automatically gold.',
      'The fixture contains 60 source-derived questions across six scenario types. A separate Gemma-powered generator writes candidates with exact evidence quotes and pending review status. The current fixture is evidence-checked by code and has not been human-reviewed. It cannot establish production accuracy.',
    ],
    [
      '05',
      'A source identifier is not a truth score',
      'Measure the property you actually checked.',
      'Runtime validation checks that every cited identifier belongs to the authorized context. It cannot prove the claims are supported. Semantic faithfulness and human correctness remain unmeasured until a dedicated review is performed. The dashboard never substitutes citation validity for answer accuracy.',
    ],
    [
      '06',
      'Small budgets need explicit boundaries',
      'Reserve before inference.',
      'A Durable Object serializes daily request and budget reservations. OpenRouter has price ceilings and a bounded response size. A conservative reservation is not an invoice; actual provider-reported cost is displayed separately. Source versions and configuration belong in any cache key.',
    ],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WHY THIS SYSTEM LOOKS THIS WAY</div>
          <h1>The decisions are the work.</h1>
          <p>Hypotheses, tradeoffs, and honest limits behind the implementation.</p>
        </div>
        <a
          className="button"
          href="https://github.com/serkanazeri/ragna#engineering-decisions"
          target="_blank"
          rel="noreferrer"
        >
          Read the README <ExternalLink size={15} />
        </a>
      </div>
      <div className="decisions-list">
        {notes.map(([number, title, subtitle, body]) => (
          <article className="decision" key={number}>
            <span className="decision-number">{number}</span>
            <div>
              <span className="eyebrow">ARCHITECTURE DECISION</span>
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
