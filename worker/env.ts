export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GUARD: DurableObjectNamespace;
  AI?: Ai;
  VECTORIZE?: Vectorize;
  SOURCES?: R2Bucket;
  ENVIRONMENT: string;
  MODEL_ROUTE: string;
  OPENROUTER_MODEL: string;
  LOCAL_MODEL: string;
  OPENROUTER_API_KEY?: string;
  RAGNA_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
  DAILY_BUDGET_USD: string;
  MAX_REQUEST_COST_USD: string;
  DAILY_REQUEST_LIMIT: string;
  SITE_URL: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}
