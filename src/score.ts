// 順位系チャートの圏外を表す値(各チャートは100位まで)
export const RANK_OUT = 101

const H = 3600

export type Signal = {
  itemId: number
  rank: number
  prevRank: number | null
  avgRank: number | null
  isNew: boolean
  streak: number
  score: number
}

/**
 * runs: このチャートの過去の成功した取得時刻(昇順、今回を含まない)
 * history: item_id -> (observed_at -> rank)
 */
export function computeSignals(
  now: number,
  current: { itemId: number; rank: number }[],
  runs: number[],
  history: Map<number, Map<number, number>>,
): Signal[] {
  const recent = runs.filter((t) => t >= now - 7 * 24 * H)
  // 24時間前に最も近い回。1日分の履歴がまだ無い間は一番古い回で代用する
  const prevRun = [...runs].reverse().find((t) => t <= now - 20 * H) ?? runs[0]

  return current.map(({ itemId, rank }) => {
    const h = history.get(itemId)
    const rankAt = (t: number) => h?.get(t) ?? RANK_OUT

    const prevRank = prevRun === undefined ? null : rankAt(prevRun)
    const avgRank = recent.length ? recent.reduce((s, t) => s + rankAt(t), 0) / recent.length : null
    const isNew = recent.length > 0 && recent.every((t) => !h?.has(t))

    let streak = 0
    let after = rank
    for (let i = runs.length - 1; i >= 0 && streak < 5; i--) {
      const r = rankAt(runs[i])
      if (r <= after) break
      streak++
      after = r
    }

    // 上位ほど1つ上げるのが難しいので順位は対数比で扱う
    const score =
      (prevRank ? Math.log(prevRank / rank) : 0) +
      0.5 * (avgRank ? Math.log(avgRank / rank) : 0) +
      0.1 * Math.min(streak, 3)

    return { itemId, rank, prevRank, avgRank, isNew, streak, score: Math.round(score * 1000) / 1000 }
  })
}
