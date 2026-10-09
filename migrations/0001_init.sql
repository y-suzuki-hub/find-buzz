CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  icon TEXT,
  artist TEXT,
  genre TEXT,
  first_seen_at INTEGER NOT NULL,
  UNIQUE (source, external_id)
);

-- 時系列の生データ。rank は順位系ソース、score はYouTube等の数値系ソース用
CREATE TABLE observations (
  chart TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  rank INTEGER,
  score REAL,
  PRIMARY KEY (chart, observed_at, item_id)
);
CREATE INDEX observations_item ON observations (item_id, chart, observed_at);

CREATE TABLE fetch_runs (
  chart TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  PRIMARY KEY (chart, observed_at)
);

-- 取得時に計算済みの急上昇指標。画面と通知はここだけを読む
CREATE TABLE signals (
  chart TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  prev_rank INTEGER,
  avg_rank REAL,
  is_new INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  score REAL NOT NULL,
  PRIMARY KEY (chart, observed_at, item_id)
);
CREATE INDEX signals_score ON signals (observed_at, score);
