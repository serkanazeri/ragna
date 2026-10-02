CREATE TABLE IF NOT EXISTS answer_cache (
 cache_key TEXT PRIMARY KEY,
 response_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answer_cache_expiry ON answer_cache(expires_at);
