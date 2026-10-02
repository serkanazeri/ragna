CREATE TABLE health_checks (
 id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, status TEXT NOT NULL,
 duration_ms REAL NOT NULL, provider TEXT, mode TEXT, reason TEXT
);
CREATE INDEX idx_health_checked ON health_checks(checked_at);
