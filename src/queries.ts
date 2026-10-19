export type Row = {
  chart: string
  observed_at: number
  item_id: number
  rank: number
  prev_rank: number | null
  avg_rank: number | null
  is_new: number
  streak: number
  score: number
  value: number | null
  prev_value: number | null
  name: string
  url: string
  icon: string | null
  artist: string | null
  genre: string | null
}

// 24h: 各チャートの最新回 / 1d・7d: 期間内でスコアが最大だった回
export type Period = '24h' | '1d' | '7d'

/** chart: 'all' / チャートID / 'hatena:' のような取得元の接頭辞。chart='all' のときは同じアプリが複数チャートに出るので、スコア最大のものだけ残す */
export async function topSignals(
  db: D1Database,
  opts: { chart: string; period: Period; minScore: number; limit: number; now: number },
) {
  const sql =
    opts.period === '24h'
      ? `WITH latest AS (SELECT chart, MAX(observed_at) t FROM fetch_runs WHERE status = 'ok' AND observed_at >= ?4 GROUP BY chart)
         SELECT s.*, i.name, i.url, i.icon, i.artist, i.genre
         FROM signals s JOIN latest l ON s.chart = l.chart AND s.observed_at = l.t
         JOIN items i ON i.id = s.item_id
         WHERE (?1 = 'all' OR s.chart = ?1 OR (?1 LIKE '%:' AND s.chart LIKE ?1 || '%')) AND s.score >= ?2
         ORDER BY s.score DESC LIMIT ?3`
      : `WITH best AS (
           SELECT chart, item_id, MAX(score) score, observed_at FROM signals
           WHERE observed_at >= ?4 AND (?1 = 'all' OR chart = ?1 OR (?1 LIKE '%:' AND chart LIKE ?1 || '%')) GROUP BY chart, item_id)
         SELECT s.*, i.name, i.url, i.icon, i.artist, i.genre
         FROM best b JOIN signals s USING (chart, item_id, observed_at)
         JOIN items i ON i.id = s.item_id
         WHERE s.score >= ?2
         ORDER BY s.score DESC LIMIT ?3`
  const params: unknown[] = [opts.chart, opts.minScore, opts.limit * 4]
  // 24h: 取得をやめたチャートの古い回が残り続けないよう、2日以内に取得した回だけを最新とみなす
  params.push(opts.now - (opts.period === '7d' ? 7 : opts.period === '1d' ? 1 : 2) * 24 * 3600)
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<Row>()

  const seen = new Set<number>()
  return results.filter((r) => !seen.has(r.item_id) && seen.add(r.item_id)).slice(0, opts.limit)
}

export type Point = { t: number; rank: number; value: number | null }

export async function rankHistory(db: D1Database, rows: Row[], now: number) {
  if (rows.length === 0) return new Map<string, Point[]>()
  const { results } = await db
    .prepare(
      `SELECT o.chart, o.item_id, o.observed_at t, o.rank, o.score value FROM observations o
       JOIN json_each(?1) j ON o.chart = j.value->>'c' AND o.item_id = j.value->>'i'
       WHERE o.observed_at >= ?2 ORDER BY o.observed_at`,
    )
    .bind(JSON.stringify(rows.map((r) => ({ c: r.chart, i: r.item_id }))), now - 7 * 24 * 3600)
    .all<{ chart: string; item_id: number; t: number; rank: number; value: number | null }>()
  const map = new Map<string, Point[]>()
  for (const r of results) {
    const k = `${r.chart}|${r.item_id}`
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push({ t: r.t, rank: r.rank, value: r.value })
  }
  return map
}

export async function recentErrors(db: D1Database, now: number) {
  const { results } = await db
    .prepare(`SELECT chart, observed_at, error FROM fetch_runs WHERE status = 'error' AND observed_at >= ?1`)
    .bind(now - 24 * 3600)
    .all<{ chart: string; observed_at: number; error: string }>()
  return results
}
