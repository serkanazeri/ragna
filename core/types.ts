export type Audience = 'public' | 'operations';
export type Category =
  'single-hop' | 'multi-hop' | 'temporal' | 'unanswerable' | 'access-control' | 'adversarial';
export interface SourceDocument {
  id: string;
  title: string;
  department: string;
  language: 'tr' | 'en';
  audience: Audience;
  version: number;
  effectiveDate: string;
  status: 'current' | 'archived';
  sections: { heading: string; text: string }[];
  provenance: 'synthetic';
}
export interface Chunk {
  id: string;
  documentId: string;
  title: string;
  heading: string;
  text: string;
  audience: Audience;
  status: 'current' | 'archived';
  version: number;
  effectiveDate: string;
  tokens: number;
}
export interface Question {
  id: string;
  question: string;
  category: Category;
  audience: Audience;
  evidence: string[];
  expectedTerms: string[];
  referenceAnswer: string;
  split: 'dev' | 'test';
  shouldAbstain: boolean;
  provenance: 'deterministic-synthetic';
  reviewStatus: 'evidence-checked-not-human-reviewed';
}
export interface Hit {
  chunk: Chunk;
  score: number;
  lexicalRank?: number;
  vectorRank?: number;
}
export interface Citation {
  id: string;
  documentId: string;
  title: string;
  heading: string;
  excerpt: string;
  version: number;
  effectiveDate: string;
}
export interface Span {
  name: string;
  durationMs: number;
  status: 'ok' | 'error' | 'skipped';
  detail?: string;
  errorKind?: 'timeout' | 'error';
}
export interface ChatResponse {
  requestId: string;
  answer: string;
  mode: 'live' | 'guided' | 'evidence' | 'abstained' | 'cached';
  provider: string;
  model: string | null;
  citations: Citation[];
  spans: Span[];
  durationMs: number;
  retrievalMode: string;
  fallbackReason: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    costKind: 'reported' | 'unavailable' | 'avoided';
  };
  cache?: { createdAt: string; expiresAt: string; originalProvider: string };
  citationValidity: number | null;
  budget?: { reservedUsd: number; dailyLimitUsd: number };
}
export interface EvalResult {
  questionId: string;
  category: Category;
  split: string;
  recall: number | null;
  mrr: number | null;
  ndcg: number | null;
  shouldAbstain: boolean;
  retrievedIds: string[];
  deniedLeakCount: number;
  latencyMs: number;
}
export interface EvalRun {
  id: string;
  createdAt: string;
  corpusVersion: string;
  datasetHash: string;
  kind: 'offline-retrieval';
  strategy: string;
  chunkSize: number;
  questionCount: number;
  metrics: { recallAt5: number; mrr: number; ndcgAt5: number; accessLeaks: number; p95Ms: number };
  results: EvalResult[];
  limitations: string[];
}
