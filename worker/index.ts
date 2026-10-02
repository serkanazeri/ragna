import { Hono } from 'hono';
import { z } from 'zod';
import corpus from '../data/corpus.json';
import questionsData from '../data/questions.json';
import evaluationData from '../reports/evaluations.json';
import {
  chunkDocuments,
  lexicalSearch,
  fuseRanks,
  permitted,
  evidencePreview,
  tokenize,
} from '../core/retrieval';
import type {
  Audience,
  ChatResponse,
  Citation,
  Hit,
  Question,
  SourceDocument,
  Span,
} from '../core/types';
import type { Env } from './env';
import { generate } from './providers';
import { abstentionMessage } from '../core/retrieval';
export { UsageGuard } from './guard';

const documents = corpus.documents as SourceDocument[];
const chunks = chunkDocuments(documents);
const questions = questionsData as Question[];
const app = new Hono<{ Bindings: Env }>();
const authorized = (request: Request, env: Env) =>
  Boolean(
    env.RAGNA_API_KEY && request.headers.get('authorization') === `Bearer ${env.RAGNA_API_KEY}`,
  );
const hash = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('retrieval_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (c.req.path.startsWith('/api') || c.req.path.startsWith('/v1'))
    c.header('Cache-Control', 'no-store');
});
app.onError((err, c) => {
  console.error(JSON.stringify({ type: 'request_error', name: err.name }));
  return c.json(
    { error: 'Request could not be completed. Please try again.', code: 'request_failed' },
    500,
  );
});
app.get('/api/status', async (c) => {
  let vectorReady = false;
  try {
    vectorReady = Boolean(
      c.env.AI &&
      c.env.VECTORIZE &&
      (
        await c.env.DB.prepare("SELECT value FROM config WHERE key='vector_corpus_hash'").first<{
          value: string;
        }>()
      )?.value === corpus.hash,
    );
  } catch {
    /* status remains degraded */
  }
  return c.json({
    name: 'RAGNA',
    version: '0.1.0',
    corpusVersion: corpus.version,
    corpusHash: corpus.hash,
    environment: c.env.ENVIRONMENT,
    providers: {
      cloudflare: Boolean(c.env.AI),
      openrouter: Boolean(c.env.OPENROUTER_API_KEY),
      local: Boolean(c.env.OLLAMA_BASE_URL && c.env.ENVIRONMENT !== 'production'),
    },
    retrieval: vectorReady ? 'hybrid' : 'lexical',
    embedding: vectorReady ? 'BGE-M3 · 1024d' : null,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
    documentCount: documents.filter((d) => d.audience === 'public' && d.status === 'current')
      .length,
    chunkCount: chunks.filter((c) => permitted(c, 'public')).length,
    questionCount: questions.length,
  });
});
app.get('/api/corpus', (c) =>
  c.json({
    version: corpus.version,
    documents: documents
      .filter((d) => d.audience === 'public' && d.status === 'current')
      .map(({ sections, ...d }) => ({
        ...d,
        sections: sections.length,
        chunkCount: chunks.filter((c) => c.documentId === d.id).length,
      })),
  }),
);
app.get('/api/sources/:id', (c) => {
  const audience: Audience = authorized(c.req.raw, c.env) ? 'operations' : 'public';
  const doc = documents.find(
    (d) =>
      d.id === c.req.param('id') &&
      d.status === 'current' &&
      (d.audience === 'public' || audience === 'operations'),
  );
  return doc ? c.json(doc) : c.json({ error: 'Source not found' }, 404);
});
app.get('/api/examples', (c) =>
  c.json(
    questions
      .filter((q) =>
        ['q-returns-1', 'q-edge-3', 'q-edge-1', 'q-edge-9', 'q-edge-6', 'q-edge-11'].includes(q.id),
      )
      .map((q) => ({ id: q.id, question: q.question, category: q.category })),
  ),
);
app.get('/api/evaluations', (c) => c.json(evaluationData));
app.post('/api/admin/index', async (c) => {
  if (!authorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  if (!c.env.AI || !c.env.VECTORIZE)
    return c.json({ error: 'Cloud AI and Vectorize bindings are required' }, 503);
  const input = z
    .object({
      offset: z.number().int().min(0).max(chunks.length).default(0),
      verify: z.boolean().optional(),
    })
    .safeParse(await c.req.json());
  if (!input.success) return c.json({ error: 'Invalid indexing request' }, 400);
  if (input.data.verify) {
    const vectors: VectorizeVector[] = [];
    try {
      for (let offset = 0; offset < chunks.length; offset += 20)
        vectors.push(
          ...(await c.env.VECTORIZE.getByIds(chunks.slice(offset, offset + 20).map((c) => c.id))),
        );
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message.slice(0, 250) : 'vector_verification_failed' },
        502,
      );
    }
    const valid =
      vectors.length === chunks.length &&
      vectors.every((v) => v.metadata?.corpusHash === corpus.hash);
    if (valid)
      await c.env.DB.prepare(
        "INSERT INTO config(key,value) VALUES('vector_corpus_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
        .bind(corpus.hash)
        .run();
    return c.json({ ready: valid, expected: chunks.length, found: vectors.length });
  }
  const batch = chunks.slice(input.data.offset, input.data.offset + 8);
  if (!batch.length) return c.json({ done: true, total: chunks.length });
  const embedded = (await c.env.AI.run(
    '@cf/baai/bge-m3' as Parameters<Ai['run']>[0],
    { text: batch.map((c) => `${c.title}\n${c.heading}\n${c.text}`) } as never,
  )) as { data: number[][] };
  if (embedded.data?.length !== batch.length || embedded.data.some((v) => v.length !== 1024))
    return c.json({ error: 'Embedding dimensions or batch length mismatch' }, 502);
  const mutation = await c.env.VECTORIZE.upsert(
    batch.map((chunk, i) => ({
      id: chunk.id,
      values: embedded.data[i],
      metadata: {
        documentId: chunk.documentId,
        audience: chunk.audience,
        status: chunk.status,
        corpusHash: corpus.hash,
      },
    })),
  );
  if (c.env.SOURCES)
    for (const chunk of batch) {
      const doc = documents.find((d) => d.id === chunk.documentId)!;
      await c.env.SOURCES.put(`sources/${corpus.version}/${doc.id}.json`, JSON.stringify(doc), {
        httpMetadata: { contentType: 'application/json' },
      });
    }
  return c.json({
    offset: input.data.offset,
    next: input.data.offset + batch.length,
    total: chunks.length,
    mutationId: mutation.mutationId,
  });
});
app.get('/api/metrics', async (c) => {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { results } = await c.env.DB.prepare(
    'SELECT r.*,f.rating FROM requests r LEFT JOIN feedback f ON r.id=f.request_id WHERE r.created_at>=? ORDER BY r.created_at DESC LIMIT 1000',
  )
    .bind(since)
    .all<Record<string, unknown>>();
  const durations = results.map((r) => Number(r.duration_ms)).sort((a, b) => a - b);
  const p = (n: number) =>
    durations.length
      ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * n) - 1)]
      : null;
  const live = results.filter((r) => r.mode === 'live');
  const rated = results.filter((r) => r.rating !== null);
  const generated = results.filter((r) => r.model !== null);
  const budget = await (
    await c.env.GUARD.get(c.env.GUARD.idFromName('public-budget')).fetch('https://guard/status')
  ).json();
  return c.json({
    budget,
    window: 'last 24 hours',
    sampleSize: results.length,
    truncated: results.length === 1000,
    total: results.length,
    live: live.length,
    evidence: results.filter((r) => r.mode === 'evidence').length,
    guided: results.filter((r) => r.mode === 'guided').length,
    abstained: results.filter((r) => r.mode === 'abstained').length,
    p50Ms: p(0.5),
    p95Ms: p(0.95),
    fallbackRate: results.length
      ? results.filter((r) => r.fallback_reason).length / results.length
      : null,
    reportedCostUsd: generated.some((r) => r.cost_usd !== null)
      ? generated.reduce((s, r) => s + Number(r.cost_usd || 0), 0)
      : null,
    costCoverage: generated.length
      ? generated.filter((r) => r.cost_usd !== null).length / generated.length
      : null,
    positiveFeedback: rated.length
      ? rated.filter((r) => r.rating === 1).length / rated.length
      : null,
    feedbackCount: rated.length,
    requests: results.slice(0, 20).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      mode: r.mode,
      provider: r.provider,
      model: r.model,
      durationMs: r.duration_ms,
      retrievalMode: r.retrieval_mode,
      fallbackReason: r.fallback_reason,
      spans: JSON.parse(String(r.spans_json)),
    })),
  });
});

const chatSchema = z.object({
  question: z.string().trim().min(3).max(1500),
  audience: z.enum(['public', 'operations']).optional(),
  turnstileToken: z.string().max(4096).optional(),
  guided: z.boolean().optional(),
});
async function retrieve(
  question: string,
  audience: Audience,
  env: Env,
  spans: Span[],
  allowInference = true,
): Promise<{ hits: Hit[]; mode: string }> {
  const start = performance.now();
  let lexical: Hit[] = [];
  let mode = 'lexical';
  const words = tokenize(question).slice(0, 24);
  const expression = words.map((w) => `"${w.replaceAll('"', '')}"`).join(' OR ');
  try {
    if (expression) {
      const { results } = await env.DB.prepare(
        "SELECT c.id, bm25(chunks_fts,0,2,2,1) AS rank FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.id WHERE chunks_fts MATCH ? AND c.status='current' AND (c.audience='public' OR ?='operations') ORDER BY rank LIMIT 20",
      )
        .bind(expression, audience)
        .all<{ id: string; rank: number }>();
      lexical = results
        .map((r, i) => ({
          chunk: chunks.find((c) => c.id === r.id)!,
          score: -r.rank,
          lexicalRank: i + 1,
        }))
        .filter((h) => h.chunk && permitted(h.chunk, audience));
    }
  } catch {
    mode = 'lexical-memory';
    lexical = lexicalSearch(question, chunks, audience);
  }
  if (!lexical.length) lexical = lexicalSearch(question, chunks, audience);
  spans.push({
    name: 'lexical retrieval',
    durationMs: performance.now() - start,
    status: 'ok',
    detail: `${lexical.length} candidates`,
  });
  if (allowInference && env.AI && env.VECTORIZE) {
    const vectorStart = performance.now();
    try {
      const ready = await env.DB.prepare(
        "SELECT value FROM config WHERE key='vector_corpus_hash'",
      ).first<{ value: string }>();
      if (ready?.value !== corpus.hash) throw new Error('index_not_ready');
      const embedded = (await bounded(
        env.AI.run('@cf/baai/bge-m3' as Parameters<Ai['run']>[0], { text: [question] } as never),
        5000,
      )) as { data: number[][] };
      if (!embedded.data?.[0] || embedded.data[0].length !== 1024)
        throw new Error('embedding_dimension_mismatch');
      const filter: VectorizeVectorMetadataFilter =
        audience === 'public' ? { audience: 'public', status: 'current' } : { status: 'current' };
      const matches = await bounded(
        env.VECTORIZE.query(embedded.data[0], { topK: 20, filter, returnMetadata: 'none' }),
        3000,
      );
      const vector = matches.matches
        .map((m, i) => ({
          chunk: chunks.find((c) => c.id === m.id)!,
          score: m.score,
          vectorRank: i + 1,
        }))
        .filter((h) => h.chunk && permitted(h.chunk, audience));
      spans.push({
        name: 'vector retrieval',
        durationMs: performance.now() - vectorStart,
        status: 'ok',
        detail: `${vector.length} candidates`,
      });
      return { hits: fuseRanks(lexical, vector), mode: 'hybrid-rrf' };
    } catch (e) {
      spans.push({
        name: 'vector retrieval',
        durationMs: performance.now() - vectorStart,
        status: 'error',
        detail:
          e instanceof Error && e.message === 'index_not_ready'
            ? 'index_not_ready'
            : 'embedding_or_vector_unavailable',
      });
    }
  }
  return { hits: lexical.slice(0, 5), mode };
}
app.post('/api/admin/retrieve', async (c) => {
  if (!authorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  const parsed = z
    .object({
      question: z.string().min(3).max(1500),
      audience: z.enum(['public', 'operations']).default('public'),
      lexicalOnly: z.boolean().default(false),
    })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'Invalid retrieval request' }, 400);
  const spans: Span[] = [];
  const start = performance.now();
  const result = await retrieve(
    parsed.data.question,
    parsed.data.audience,
    c.env,
    spans,
    !parsed.data.lexicalOnly,
  );
  return c.json({
    mode: result.mode,
    corpusHash: corpus.hash,
    durationMs: performance.now() - start,
    spans,
    hits: result.hits.map((h) => ({
      id: h.chunk.id,
      documentId: h.chunk.documentId,
      audience: h.chunk.audience,
      status: h.chunk.status,
      score: h.score,
    })),
  });
});
async function runChat(
  input: z.infer<typeof chatSchema>,
  request: Request,
  env: Env,
): Promise<ChatResponse> {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  const spans: Span[] = [];
  const trusted = authorized(request, env);
  const audience: Audience = trusted && input.audience === 'operations' ? 'operations' : 'public';
  const client = await hash(request.headers.get('cf-connecting-ip') || 'local');
  const guard = env.GUARD.get(env.GUARD.idFromName('public-budget'));
  const quota = input.guided
    ? Response.json({ allowed: false, reservedUsd: 0, dailyLimitUsd: Number(env.DAILY_BUDGET_USD) })
    : await guard.fetch(
        new Request('https://guard/reserve', {
          method: 'POST',
          body: JSON.stringify({ client, trusted }),
        }),
      );
  const budget = (await quota.json()) as {
    allowed: boolean;
    reservedUsd: number;
    dailyLimitUsd: number;
  };
  const retStart = performance.now();
  const { hits, mode: retrievalMode } = await retrieve(
    input.question,
    audience,
    env,
    spans,
    budget.allowed && !input.guided,
  );
  const retrievalMs = performance.now() - retStart;
  const citations: Citation[] = hits.map((h, i) => ({
    id: `S${i + 1}`,
    documentId: h.chunk.documentId,
    title: h.chunk.title,
    heading: h.chunk.heading,
    excerpt: h.chunk.text,
    version: h.chunk.version,
    effectiveDate: h.chunk.effectiveDate,
  }));
  const guided = questions.find(
    (q) => q.audience === audience && q.question.trim() === input.question.trim(),
  );
  let result: ChatResponse = {
    requestId,
    answer: '',
    mode: 'evidence',
    provider: 'evidence',
    model: null,
    citations,
    spans,
    durationMs: 0,
    retrievalMode,
    fallbackReason: null,
    usage: { inputTokens: null, outputTokens: null, costUsd: null, costKind: 'unavailable' },
    citationValidity: null,
    budget: {
      reservedUsd: budget.reservedUsd || 0,
      dailyLimitUsd: budget.dailyLimitUsd || Number(env.DAILY_BUDGET_USD),
    },
  };
  if (input.guided && guided) {
    const selected = guided.evidence
      .map((id) => citations.find((c) => c.documentId === id))
      .filter(Boolean) as Citation[];
    // Guided fixtures may be shown only when every reference is still accessible and current.
    if (selected.length === guided.evidence.length) {
      result.answer = guided.referenceAnswer;
      result.mode = guided.shouldAbstain ? 'abstained' : 'guided';
      result.provider = 'review-fixture';
      result.citations = selected;
    }
  }
  if (!result.answer && budget.allowed && hits.length) {
    const generated = await generate(
      env,
      input.question,
      citations.map((c) => ({ id: c.id, text: c.excerpt, title: c.title })),
      spans,
    );
    result.fallbackReason = generated.reason;
    if (generated.result) {
      const g = generated.result;
      result = {
        ...result,
        answer: g.abstained ? abstentionMessage(input.question) : g.answer,
        mode: g.abstained ? 'abstained' : 'live',
        provider: g.provider,
        model: g.model,
        citations: citations.filter((c) => g.citations.includes(c.id)),
        citationValidity: 1,
        usage: {
          inputTokens: g.inputTokens,
          outputTokens: g.outputTokens,
          costUsd: g.costUsd,
          costKind: g.costUsd === null ? 'unavailable' : 'reported',
        },
      };
    }
  }
  if (!result.answer) {
    result.fallbackReason = budget.allowed
      ? result.fallbackReason || 'insufficient_evidence'
      : 'demo_quota';
    if (guided && guided.shouldAbstain) {
      result.answer = guided.referenceAnswer;
      result.citations = [];
      result.mode = 'abstained';
      result.provider = 'review-fixture';
    } else {
      result.answer = evidencePreview(hits);
      result.mode = hits.length ? 'evidence' : 'abstained';
      result.provider = 'evidence';
    }
  }
  result.durationMs = performance.now() - start;
  try {
    await env.DB.prepare(
      'INSERT INTO requests (id,created_at,mode,provider,model,duration_ms,retrieval_ms,retrieval_mode,fallback_reason,input_tokens,output_tokens,cost_usd,citation_validity,spans_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        requestId,
        new Date().toISOString(),
        result.mode,
        result.provider,
        result.model,
        result.durationMs,
        retrievalMs,
        retrievalMode,
        result.fallbackReason,
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.costUsd,
        result.citationValidity,
        JSON.stringify(spans),
      )
      .run();
  } catch {
    console.error(JSON.stringify({ type: 'telemetry_write_failed', requestId }));
  }
  return result;
}
app.post('/api/chat', async (c) => {
  if (Number(c.req.header('content-length') || 0) > 10000)
    return c.json({ error: 'Request too large' }, 413);
  const body = await c.req.text();
  if (body.length > 10000) return c.json({ error: 'Request too large' }, 413);
  let decoded;
  try {
    decoded = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = chatSchema.safeParse(decoded);
  if (!parsed.success) return c.json({ error: 'Question must contain 3–1500 characters.' }, 400);
  if (c.env.TURNSTILE_SECRET_KEY && !authorized(c.req.raw, c.env)) {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET_KEY,
        response: parsed.data.turnstileToken || '',
      }),
      signal: AbortSignal.timeout(5000),
    });
    const validation = (await response.json()) as { success: boolean; hostname?: string };
    if (!validation.success || validation.hostname !== new URL(c.env.SITE_URL).hostname)
      return c.json({ error: 'Please complete the verification.' }, 403);
  }
  return c.json(await runChat(parsed.data, c.req.raw, c.env));
});
app.post('/api/feedback', async (c) => {
  const parsed = z
    .object({ requestId: z.string().uuid(), rating: z.union([z.literal(1), z.literal(-1)]) })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'Invalid feedback' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM requests WHERE id=?')
    .bind(parsed.data.requestId)
    .first();
  if (!exists) return c.json({ error: 'Request not found' }, 404);
  await c.env.DB.prepare(
    'INSERT INTO feedback (request_id,rating,created_at) VALUES (?,?,?) ON CONFLICT(request_id) DO UPDATE SET rating=excluded.rating',
  )
    .bind(parsed.data.requestId, parsed.data.rating, new Date().toISOString())
    .run();
  return c.json({ ok: true });
});
app.get('/v1/models', (c) =>
  authorized(c.req.raw, c.env)
    ? c.json({ object: 'list', data: [{ id: 'ragna', object: 'model', owned_by: 'ragna' }] })
    : c.json({ error: 'Unauthorized' }, 401),
);
app.post('/v1/chat/completions', async (c) => {
  if (!authorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  const raw = await c.req.text();
  if (raw.length > 20000) return c.json({ error: 'Request too large' }, 413);
  let decoded;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = z
    .object({
      messages: z
        .array(z.object({ role: z.string(), content: z.string() }))
        .min(1)
        .max(40),
      stream: z.boolean().optional(),
    })
    .safeParse(decoded);
  if (!parsed.success) return c.json({ error: 'Invalid messages' }, 400);
  const question = parsed.data.messages.filter((m) => m.role === 'user').at(-1)?.content;
  const input = chatSchema.safeParse({ question });
  if (!input.success) return c.json({ error: 'Invalid question' }, 400);
  const r = await runChat(input.data, c.req.raw, c.env);
  const label =
    r.mode === 'live'
      ? ''
      : `[${r.mode.toUpperCase()} — ${r.fallbackReason || 'recorded example'}]\n\n`;
  const answer =
    label +
    r.answer +
    '\n\n' +
    r.citations.map((s) => `[${s.id}] ${s.title} · ${s.heading} · v${s.version}`).join('\n');
  if (parsed.data.stream) {
    const chunk = {
      id: r.requestId,
      object: 'chat.completion.chunk',
      model: 'ragna',
      choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: null }],
    };
    // Buffered adapter: retrieval + validation finish before any content is emitted.
    return new Response(
      `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } },
    );
  }
  return c.json({
    id: r.requestId,
    object: 'chat.completion',
    model: 'ragna',
    choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
  });
});
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
