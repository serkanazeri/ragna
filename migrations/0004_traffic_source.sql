-- Eski kayıtların kaynağı tahmin edilmez; açıkça legacy olarak tutulur.
ALTER TABLE requests ADD COLUMN traffic_source TEXT NOT NULL DEFAULT 'legacy' CHECK(traffic_source IN ('visitor','operator','evaluation','smoke','warmup','legacy'));
ALTER TABLE requests ADD COLUMN guided_requested INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_requests_traffic_created ON requests(traffic_source,created_at);
