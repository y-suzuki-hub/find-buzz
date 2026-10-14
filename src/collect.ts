import { computeCountSignals, computeSignals } from './score'
import type { ChartKind, FetchedItem } from './sources/types'

export type ChartResult = {
  chart: string
  source: string
  kind: ChartKind
  rankOut: number
  items?: FetchedItem[]
  error?: string
}

export async function ingestAll(db: D1Database, now: number, results: ChartResult[]) {
  // 1つの取得元が落ちても他のチャートは保存する
  const settled = await Promise.allSettled(results.map((r) => ingestChart(db, r, now)))
  const failed = settled.flatMap((r, i) => (r.status === 'rejected' ? [`${results[i].chart}: ${r.reason}`] : []))
  if (failed.length) console.error('ingest failed', failed)
  return { ok: results.length - failed.length, failed }
}

async function ingestChart(db: D1Database, result: ChartResult, now: number) {
  const chart = { id: result.chart, source: result.source }
  try {
    if (result.error || !result.items?.length) throw new Error(result.error ?? 'no items')
    const fetched = result.items

    // D1は1クエリのバインド数に上限があるため、配列はJSONで渡してjson_eachで展開する
    await db
      .prepare(
        `INSERT INTO items (source, external_id, name, url, icon, artist, genre, first_seen_at)
         SELECT ?1, j.value->>'externalId', j.value->>'name', j.value->>'url', j.value->>'icon',
                j.value->>'artist', j.value->>'genre', ?2
         FROM json_each(?3) j WHERE true
         ON CONFLICT (source, external_id) DO UPDATE SET name = excluded.name, icon = excluded.icon
         WHERE items.name IS NOT excluded.name OR items.icon IS NOT excluded.icon`,
      )
      .bind(chart.source, now, JSON.stringify(fetched))
      .run()

    const { results: idRows } = await db
      .prepare(
        `SELECT id, external_id FROM items
         WHERE source = ?1 AND external_id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(chart.source, JSON.stringify(fetched.map((f) => f.externalId)))
      .all<{ id: number; external_id: string }>()
    const idOf = new Map(idRows.map((r) => [r.external_id, r.id]))
    const current = fetched.map((f, i) => ({ itemId: idOf.get(f.externalId)!, rank: i + 1, value: f.value ?? null }))

    const since = now - 8 * 24 * 3600
    const [runRows, histRows] = await db.batch([
      db
        .prepare(
          `SELECT observed_at FROM fetch_runs
           WHERE chart = ?1 AND status = 'ok' AND observed_at >= ?2 AND observed_at < ?3 ORDER BY observed_at`,
        )
        .bind(chart.id, since, now),
      db
        .prepare(
          `SELECT item_id, observed_at, rank, score FROM observations
           WHERE chart = ?1 AND observed_at >= ?2 AND observed_at < ?3`,
        )
        .bind(chart.id, since, now),
    ])
    const runs = (runRows.results as { observed_at: number }[]).map((r) => r.observed_at)
    const history = new Map<number, Map<number, number>>()
    const counted = result.kind === 'count'
    for (const r of histRows.results as { item_id: number; observed_at: number; rank: number; score: number }[]) {
      if (!history.has(r.item_id)) history.set(r.item_id, new Map())
      history.get(r.item_id)!.set(r.observed_at, counted ? r.score : r.rank)
    }

    const signals = counted
      ? computeCountSignals(now, current, runs, history)
      : computeSignals(now, current, runs, history, result.rankOut)

    await db.batch([
      db
        .prepare(
          `INSERT OR REPLACE INTO observations (chart, observed_at, item_id, rank, score)
           SELECT ?1, ?2, j.value->>'itemId', j.value->>'rank', j.value->>'value' FROM json_each(?3) j`,
        )
        .bind(chart.id, now, JSON.stringify(current)),
      db
        .prepare(
          `INSERT OR REPLACE INTO signals (chart, observed_at, item_id, rank, prev_rank, avg_rank, is_new, streak, score, value, prev_value)
           SELECT ?1, ?2, j.value->>'itemId', j.value->>'rank', j.value->>'prevRank', j.value->>'avgRank',
                  j.value->>'isNew', j.value->>'streak', j.value->>'score', j.value->>'value', j.value->>'prevValue'
           FROM json_each(?3) j`,
        )
        .bind(chart.id, now, JSON.stringify(signals)),
      db
        .prepare(`INSERT OR REPLACE INTO fetch_runs (chart, observed_at, status, item_count) VALUES (?1, ?2, 'ok', ?3)`)
        .bind(chart.id, now, current.length),
    ])
  } catch (e) {
    await db
      .prepare(`INSERT OR REPLACE INTO fetch_runs (chart, observed_at, status, error) VALUES (?1, ?2, 'error', ?3)`)
      .bind(chart.id, now, String(e).slice(0, 500))
      .run()
    throw e
  }
}
