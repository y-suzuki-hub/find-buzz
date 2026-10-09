import type { FC } from 'hono/jsx'
import { RANK_OUT } from './score'
import type { Period, Row } from './queries'

type Point = { t: number; rank: number }

const css = `
:root{--bg:#f7f7f5;--card:#fff;--text:#1d1d1f;--muted:#6e6e73;--line:#e5e5ea;--accent:#e8590c;--up:#2b8a3e;--new:#1971c2}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--card:#1e1e1e;--text:#ececec;--muted:#9a9a9f;--line:#2e2e30;--accent:#ff8a3d;--up:#51cf66;--new:#4dabf7}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--muted);font-size:13px;margin:0 0 20px}
form{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:16px}
label{display:flex;flex-direction:column;font-size:12px;color:var(--muted);gap:2px}
select,input,button{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text)}
input[type=number]{width:90px}
button{background:var(--accent);border-color:var(--accent);color:#fff;cursor:pointer}
ol{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
li{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
li img{width:48px;height:48px;border-radius:11px;display:block}
.name{font-weight:600;color:inherit;text-decoration:none}
.name:hover{text-decoration:underline}
.meta{font-size:12px;color:var(--muted)}
.move{font-size:13px;margin-top:2px}
.up{color:var(--up);font-weight:600}
.badge{display:inline-block;font-size:11px;padding:0 6px;border-radius:4px;background:var(--new);color:#fff;margin-right:4px}
.right{text-align:right}
.score{font-size:18px;font-weight:700;color:var(--accent)}
svg{display:block;margin-top:4px}
.empty{padding:32px;text-align:center;color:var(--muted);background:var(--card);border-radius:12px;border:1px solid var(--line)}
.err{font-size:13px;color:var(--accent);margin-bottom:12px}
@media (max-width:560px){li{grid-template-columns:40px 1fr}li img{width:40px;height:40px}.right{grid-column:2;text-align:left;display:flex;gap:12px;align-items:center}}
`

const rankText = (r: number | null) => (r === null ? '–' : r >= RANK_OUT ? '圏外' : `${r}位`)

// 順位は小さいほど上なので、上が1位・下が圏外になるよう描く
const Spark: FC<{ points: Point[]; now: number }> = ({ points, now }) => {
  const w = 120
  const h = 32
  const from = now - 7 * 24 * 3600
  if (points.length < 2) return null
  const x = (t: number) => ((t - from) / (now - from)) * w
  const y = (r: number) => ((Math.min(r, RANK_OUT) - 1) / (RANK_OUT - 1)) * (h - 4) + 2
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.rank).toFixed(1)}`).join('')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="7日間の順位推移">
      <path d={d} fill="none" stroke="var(--accent)" stroke-width="1.5" />
    </svg>
  )
}

export const Page: FC<{
  rows: Row[]
  history: Map<string, Point[]>
  charts: { id: string; label: string }[]
  chartLabel: (id: string) => string
  q: { chart: string; period: Period; min: number }
  now: number
  lastFetched: number | null
  errorCount: number
}> = ({ rows, history, charts, chartLabel, q, now, lastFetched, errorCount }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>急上昇アプリ | find-buzz</title>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <main>
        <h1>急上昇アプリ</h1>
        <p class="sub">
          App Store 日本ランキングの順位変動から算出
          {lastFetched ? ` ・ 最終取得 ${new Date(lastFetched * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}` : ''}
        </p>
        {errorCount > 0 && <p class="err">直近24時間に取得エラーが {errorCount} 件あります</p>}
        <form method="get">
          <label>
            チャート
            <select name="chart">
              <option value="all" selected={q.chart === 'all'}>すべて</option>
              {charts.map((c) => (
                <option value={c.id} selected={q.chart === c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            期間
            <select name="period">
              <option value="24h" selected={q.period === '24h'}>最新</option>
              <option value="7d" selected={q.period === '7d'}>7日間のピーク</option>
            </select>
          </label>
          <label>
            最小スコア
            <input type="number" name="min" step="0.1" value={String(q.min)} />
          </label>
          <button type="submit">絞り込む</button>
        </form>
        {rows.length === 0 ? (
          <p class="empty">該当なし。履歴が溜まると(取得2回目以降)表示されます。</p>
        ) : (
          <ol>
            {rows.map((r) => (
              <li>
                {r.icon ? <img src={r.icon} alt="" width="48" height="48" loading="lazy" decoding="async" /> : <span />}
                <div>
                  <a class="name" href={r.url} target="_blank" rel="noopener">{r.name}</a>
                  <div class="meta">
                    {chartLabel(r.chart)}
                    {r.artist ? ` ・ ${r.artist}` : ''}
                  </div>
                  <div class="move">
                    {r.is_new ? <span class="badge">NEW</span> : null}
                    {rankText(r.prev_rank)} → <span class="up">{rankText(r.rank)}</span>
                    <span class="meta"> ・ 7日平均 {r.avg_rank ? `${r.avg_rank.toFixed(0)}位` : '–'}{r.streak > 1 ? ` ・ ${r.streak}回連続上昇` : ''}</span>
                  </div>
                </div>
                <div class="right">
                  <div class="score">{r.score.toFixed(2)}</div>
                  <Spark points={history.get(`${r.chart}|${r.item_id}`) ?? []} now={now} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </body>
  </html>
)
