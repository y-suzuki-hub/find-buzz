-- count系チャート(はてブ等)用: 今回と比較時点の計測値
ALTER TABLE signals ADD COLUMN value REAL;
ALTER TABLE signals ADD COLUMN prev_value REAL;
