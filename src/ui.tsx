import type { FC } from 'hono/jsx'
import { rankOut } from './charts'
import type { Period, Point, Row } from './queries'
import type { ChartKind } from './sources/types'

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
select,input,button{font:inherit;height:36px;line-height:1;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text)}
input[type=number]{width:90px}
button{background:var(--accent);border-color:var(--accent);color:#fff;cursor:pointer}
ol{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
ol>li{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
ol>li img{width:48px;height:48px;border-radius:11px;display:block}
.name{font-weight:600;color:inherit;text-decoration:none}
.name:hover{text-decoration:underline}
.meta{font-size:12px;color:var(--muted)}
.move{font-size:13px;margin-top:2px}
.up{color:var(--up);font-weight:600}
.badge{display:inline-block;font-size:11px;padding:0 6px;border-radius:4px;background:var(--new);color:#fff;margin-right:4px}
.right{text-align:right}
.score{font-size:18px;font-weight:700;color:var(--accent)}
.noicon{width:48px;height:48px;border-radius:11px;background:#6e6e73;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:16px}
.noicon[data-s="hatena:"]{background:#00a4de}.noicon[data-s="zenn:"]{background:#3ea8ff}.noicon[data-s="googletrends:"]{background:#4285f4}.noicon[data-s="hn:"]{background:#ff6600}
.score-label{font-size:11px;color:var(--muted)}
body{text-wrap:pretty}
.help{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:13px;margin:0 0 16px}
.help strong{color:var(--accent)}
.help ul{margin:6px 0 0;padding-left:18px;color:var(--muted)}
svg{display:block;margin-top:4px}
.empty{padding:32px;text-align:center;color:var(--muted);background:var(--card);border-radius:12px;border:1px solid var(--line)}
.err{font-size:13px;color:var(--accent);margin-bottom:12px}
@media (max-width:560px){ol>li{grid-template-columns:40px 1fr}ol>li img,.noicon{width:40px;height:40px}.right{grid-column:2;text-align:left;display:flex;gap:12px;align-items:center}}
`

const rankText = (r: number | null, out: number) => (r === null ? '–' : r >= out ? '圏外' : `${r}位`)

const SOURCES: { prefix: string; group: string; mark: string; unit: (v: number | null) => string; metric: string }[] = [
  { prefix: 'appstore:', group: 'App Store', mark: '', metric: '', unit: () => '' },
  { prefix: 'hatena:', group: 'はてなブックマーク', mark: 'B!', metric: 'ブクマ', unit: (v) => `${v ?? 0}件` },
  { prefix: 'zenn:', group: 'Zenn', mark: 'Z', metric: '', unit: () => '' },
  { prefix: 'googletrends:', group: 'Googleトレンド', mark: 'G', metric: '検索数', unit: (v) => `${(v ?? 0).toLocaleString()}+` },
  { prefix: 'hn:', group: 'Hacker News', mark: 'Y', metric: 'ポイント', unit: (v) => `${v ?? 0}pt` },
  { prefix: 'github:', group: 'GitHub', mark: 'GH', metric: 'スター', unit: (v) => `★${(v ?? 0).toLocaleString()}` },
]
const sourceOf = (chart: string) => SOURCES.find((x) => chart.startsWith(x.prefix)) ?? SOURCES[0]

// 順位は小さいほど上なので上が1位・下が圏外、count系は値が大きいほど上に描く
const Spark: FC<{ points: Point[]; now: number; kind: ChartKind; out: number }> = ({ points, now, kind, out }) => {
  const w = 120
  const h = 32
  const from = now - 7 * 24 * 3600
  if (points.length < 2) return null
  const x = (t: number) => ((t - from) / (now - from)) * w
  const max = Math.max(1, ...points.map((p) => p.value ?? 0))
  const y = (p: Point) =>
    kind === 'count'
      ? h - 2 - ((p.value ?? 0) / max) * (h - 4)
      : ((Math.min(p.rank, out) - 1) / (out - 1)) * (h - 4) + 2
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p).toFixed(1)}`).join('')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="7日間の推移">
      <path d={d} fill="none" stroke="var(--accent)" stroke-width="1.5" />
    </svg>
  )
}

export const Page: FC<{
  rows: Row[]
  history: Map<string, Point[]>
  charts: { id: string; label: string }[]
  chartLabel: (id: string) => string
  chartKind: (id: string) => ChartKind
  q: { chart: string; period: Period; min: number }
  now: number
  lastFetched: number | null
  errorCount: number
}> = ({ rows, history, charts, chartLabel, chartKind, q, now, lastFetched, errorCount }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>急上昇 | find-buzz</title>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <main>
        <h1>急上昇</h1>
        <p class="sub">
          App Store・はてブ・Zenn・Googleトレンド・Hacker News・GitHubの、順位や数の伸びから算出
          {lastFetched ? ` ・ 最終取得 ${new Date(lastFetched * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}` : ''}
        </p>
        <div class="help">
          <strong>急上昇スコア</strong>(オレンジの数字)は、<b>この24時間でどれだけ急に伸びたか</b>を表します。大きいほど急上昇。変化がなければ0。
          <ul>
            <li>App Store: 50位 → 25位(順位が半分に) → 約1.0、圏外(100位より下) → 10位 → 約3.5</li>
            <li>はてブ: ブクマ100 → 300件 → 約1.1、0 → 30件 → 約3.4</li>
            <li>Zenn: トレンド20位までの順位の上がり方。Googleトレンド・Hacker News・GitHub: 検索数・ポイント・スター数の伸び</li>
          </ul>
        </div>
        {errorCount > 0 && <p class="err">直近24時間に取得エラーが {errorCount} 件あります</p>}
        <form method="get">
          <label>
            チャート
            <select name="chart" onchange="this.form.submit()">
              <option value="all" selected={q.chart === 'all'}>すべて</option>
              {SOURCES.map(({ group, prefix }) => (
                <optgroup label={group}>
                  {charts
                    .filter((c) => c.id.startsWith(prefix))
                    .map((c) => (
                      <option value={c.id} selected={q.chart === c.id}>{c.label}</option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            期間
            <select name="period" onchange="this.form.submit()">
              <option value="24h" selected={q.period === '24h'}>最新</option>
              <option value="7d" selected={q.period === '7d'}>7日間のピーク</option>
            </select>
          </label>
          <label>
            最小スコア(この数字以上を表示)
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
                {r.icon ? (
                  <img src={r.icon} alt="" width="48" height="48" loading="lazy" decoding="async" />
                ) : (
                  <span class="noicon" data-s={sourceOf(r.chart).prefix} aria-hidden="true">{sourceOf(r.chart).mark}</span>
                )}
                <div>
                  <a class="name" href={r.url} target="_blank" rel="noopener">{r.name}</a>
                  <div class="meta">
                    {chartLabel(r.chart)}
                    {r.artist ? ` ・ ${r.artist}` : ''}
                  </div>
                  <div class="move">
                    {r.is_new ? <span class="badge">NEW</span> : null}
                    {chartKind(r.chart) === 'count' ? (
                      <>
                        {sourceOf(r.chart).metric} {r.prev_value === null ? '–' : sourceOf(r.chart).unit(r.prev_value)} →{' '}
                        <span class="up">{sourceOf(r.chart).unit(r.value)}</span>
                        <span class="meta">
                          {r.streak > 1 ? ` ・ ${r.streak}回連続増加` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        {rankText(r.prev_rank, rankOut(r.chart))} → <span class="up">{rankText(r.rank, rankOut(r.chart))}</span>
                        <span class="meta"> ・ 7日平均 {r.avg_rank ? `${r.avg_rank.toFixed(0)}位` : '–'}{r.streak > 1 ? ` ・ ${r.streak}回連続上昇` : ''}</span>
                      </>
                    )}
                  </div>
                </div>
                <div class="right">
                  <div class="score-label">急上昇スコア</div>
                  <div class="score">{r.score.toFixed(2)}</div>
                  <Spark points={history.get(`${r.chart}|${r.item_id}`) ?? []} now={now} kind={chartKind(r.chart)} out={rankOut(r.chart)} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </body>
  </html>
)
