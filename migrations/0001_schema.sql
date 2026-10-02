CREATE TABLE IF NOT EXISTS chunks (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, title TEXT NOT NULL, heading TEXT NOT NULL,
 body TEXT NOT NULL, audience TEXT NOT NULL CHECK(audience IN ('public','operations')),
 status TEXT NOT NULL CHECK(status IN ('current','archived')), version INTEGER NOT NULL, effective_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_access ON chunks(audience,status);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED,title,heading,body,tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, mode TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
 duration_ms REAL NOT NULL, retrieval_ms REAL NOT NULL, retrieval_mode TEXT NOT NULL,
 fallback_reason TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL, citation_validity REAL,
 error INTEGER NOT NULL DEFAULT 0, spans_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
CREATE TABLE IF NOT EXISTS feedback (
 request_id TEXT PRIMARY KEY REFERENCES requests(id), rating INTEGER CHECK(rating IN (-1,1)), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
