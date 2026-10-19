-- 「なぜ伸びてる？」の生成結果。同じ項目は24時間このキャッシュを返す
CREATE TABLE backgrounds (
  chart TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  summary TEXT NOT NULL,
  sources TEXT NOT NULL,
  PRIMARY KEY (chart, item_id)
);
CREATE INDEX backgrounds_created ON backgrounds (created_at);
