-- 取得元が項目に紐づけている関連ニュース(Googleトレンド)。画面には出さず「なぜ伸びてる？」の手がかりにだけ使う
ALTER TABLE items ADD COLUMN news_json TEXT;
