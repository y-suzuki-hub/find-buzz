import { Hono } from 'hono'
import { BackgroundError, getBackground } from './background'
import { chartLabel, chartOf, charts, rankOut } from './charts'
import { ingestAll, type ChartResult } from './collect'
import { sendDigest } from './notify'
import { rankHistory, recentErrors, topSignals, type Period } from './queries'
import { Page } from './ui'

const nowSec = () => Math.floor(Date.now() / 1000)

const app = new Hono<{ Bindings: Env }>()

app.get('/', async (c) => {
  const now = nowSec()
  const chart = charts.some((x) => x.id === c.req.query('chart')) ? c.req.query('chart')! : 'all'
  const period: Period = c.req.query('period') === '7d' ? '7d' : '24h'
  const min = Number(c.req.query('min') ?? '0.1')
  const q = { chart, period, min: Number.isFinite(min) ? min : 0.1 }

  const rows = await topSignals(c.env.DB, { ...q, minScore: q.min, limit: 50, now })
  const [history, errors, last] = await Promise.all([
    rankHistory(c.env.DB, rows, now),
    recentErrors(c.env.DB, now),
    c.env.DB.prepare(`SELECT MAX(observed_at) t FROM fetch_runs WHERE status = 'ok'`).first<number>('t'),
  ])

  return c.html(
    <Page
      rows={rows}
      history={history}
      charts={charts.map(({ id, label }) => ({ id, label }))}
      chartKind={(id: string) => chartOf(id)?.kind ?? 'rank'}
      chartLabel={chartLabel}
      q={q}
      now={now}
      lastFetched={last}
      errorCount={errors.length}
    />,
  )
})

// 別サイトのページから生成を叩かれないよう、同じオリジンからのリクエストだけ受け付ける
app.post('/background', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ chart?: unknown; itemId?: unknown }>().catch(() => null)
  const itemId = Number(body?.itemId)
  if (typeof body?.chart !== 'string' || !Number.isInteger(itemId)) return c.json({ error: 'bad request' }, 400)
  try {
    return c.json(await getBackground(c.env, body.chart, itemId, nowSec()))
  } catch (e) {
    if (e instanceof BackgroundError) return c.json({ error: e.message }, e.status)
    console.error('background failed', e)
    return c.json({ error: '説明の生成に失敗しました' }, 500)
  }
})

app.get('/app.js', (c) =>
  c.body(CLIENT_JS, 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' }),
)

// Apple RSSはCloudflareからのアクセスを403で拒否するため、取得はGitHub Actionsで行いここへ送る
app.post('/ingest', async (c) => {
  if (!(await tokenMatches(c.req.header('authorization') ?? '', `Bearer ${c.env.INGEST_TOKEN ?? ''}`)) || !c.env.INGEST_TOKEN)
    return c.text('forbidden', 403)

  const body = await c.req.json<{ observedAt?: unknown; results?: unknown }>().catch(() => null)
  const observedAt = Number(body?.observedAt)
  if (!Number.isInteger(observedAt) || !Array.isArray(body?.results)) return c.text('bad request', 400)

  const results: ChartResult[] = []
  for (const r of body.results as ChartResult[]) {
    const chart = chartOf(r?.chart)
    if (!chart) return c.text(`unknown chart: ${String(r?.chart).slice(0, 80)}`, 400)
    const items = Array.isArray(r.items)
      ? r.items
          .slice(0, 200)
          .filter((i) => typeof i?.externalId === 'string' && typeof i?.name === 'string' && typeof i?.url === 'string')
          .map((i) => ({ ...i, value: Number.isFinite(i.value) ? i.value : undefined }))
      : undefined
    results.push({ chart: chart.id, source: chart.source, kind: chart.kind, rankOut: rankOut(chart.id), items, error: typeof r.error === 'string' ? r.error.slice(0, 500) : undefined })
  }

  return c.json(await ingestAll(c.env.DB, observedAt, results))
})

async function tokenMatches(a: string, b: string) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))))
  return crypto.subtle.timingSafeEqual(ha, hb)
}

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    await sendDigest(env, Math.floor(controller.scheduledTime / 1000), env.APP_URL || null)
  },
} satisfies ExportedHandler<Env>

const CLIENT_JS = `document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.why')
  if (!btn) return
  const out = btn.nextElementSibling
  if (out.dataset.loaded) { out.hidden = !out.hidden; return }
  btn.disabled = true
  out.hidden = false
  out.textContent = '調べています…(初回は10〜30秒ほどかかります)'
  try {
    const res = await fetch('/background', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chart: btn.dataset.chart, itemId: Number(btn.dataset.item) }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '失敗しました')
    out.textContent = ''
    for (const line of data.summary.split('\\n')) {
      const m = line.match(/^(何か|なぜ今|切り口)[:：]\\s*(.*)$/)
      const p = document.createElement('p')
      if (m) { const b = document.createElement('b'); b.textContent = m[1]; p.append(b, ' ' + m[2]) } else p.textContent = line
      out.append(p)
    }
    if (data.sources.length) {
      const p = document.createElement('p')
      p.className = 'why-src'
      p.append('出典: ')
      data.sources.forEach((s, i) => {
        const a = document.createElement('a')
        a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.title
        if (i) p.append(' / ')
        p.append(a)
      })
      out.append(p)
    }
    out.dataset.loaded = '1'
  } catch (err) {
    out.textContent = err.message
  } finally {
    btn.disabled = false
  }
})
`
