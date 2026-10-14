// 順位系チャートの圏外を表す既定値(App Storeは100位まで)
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
  value: number | null
  prevValue: number | null
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
  rankOut = RANK_OUT,
): Signal[] {
  const recent = runs.filter((t) => t >= now - 7 * 24 * H)
  // 24時間前に最も近い回。1日分の履歴がまだ無い間は一番古い回で代用する
  const prevRun = [...runs].reverse().find((t) => t <= now - 20 * H) ?? runs[0]

  return current.map(({ itemId, rank }) => {
    const h = history.get(itemId)
    const rankAt = (t: number) => h?.get(t) ?? rankOut

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

    return { itemId, rank, prevRank, avgRank, isNew, streak, score: round(score), value: null, prevValue: null }
  })
}

/**
 * count系チャート(はてブ等)用。24時間前と比べた計測値の伸びを対数比で測る
 * history: item_id -> (observed_at -> value)
 */
export function computeCountSignals(
  now: number,
  current: { itemId: number; rank: number; value: number | null }[],
  runs: number[],
  history: Map<number, Map<number, number>>,
): Signal[] {
  const recent = runs.filter((t) => t >= now - 7 * 24 * H)
  const prevRun = [...runs].reverse().find((t) => t <= now - 20 * H) ?? runs[0]

  return current.map(({ itemId, rank, value: v }) => {
    const value = v ?? 0
    const h = history.get(itemId)
    // 人気エントリーに載る前は計測していないので、載っていなかった回は0件とみなす
    const valueAt = (t: number) => h?.get(t) ?? 0

    const prevValue = prevRun === undefined ? null : valueAt(prevRun)
    const isNew = recent.length > 0 && recent.every((t) => !h?.has(t))

    let streak = 0
    let after = value
    for (let i = runs.length - 1; i >= 0 && streak < 5; i--) {
      const v = valueAt(runs[i])
      if (v >= after) break
      streak++
      after = v
    }

    const score = (prevValue === null ? 0 : Math.log((value + 1) / (prevValue + 1))) + 0.1 * Math.min(streak, 3)
    return { itemId, rank, prevRank: null, avgRank: null, isNew, streak, score: round(score), value, prevValue }
  })
}

const round = (n: number) => Math.round(n * 1000) / 1000
