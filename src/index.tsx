import { Hono } from 'hono'
import { chartLabel, charts } from './charts'
import { collectAll } from './collect'
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
      chartLabel={chartLabel}
      q={q}
      now={now}
      lastFetched={last}
      errorCount={errors.length}
    />,
  )
})

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    // 同じ回の全チャートで時刻を揃えるため、cronの予定時刻(分単位)を観測時刻にする
    const now = Math.floor(controller.scheduledTime / 60000) * 60
    if (controller.cron === '30 22 * * *') {
      await sendDigest(env, now, env.APP_URL || null)
    } else {
      await collectAll(env.DB, now)
    }
  },
} satisfies ExportedHandler<Env>
