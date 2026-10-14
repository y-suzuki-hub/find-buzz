import { Hono } from 'hono'
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
