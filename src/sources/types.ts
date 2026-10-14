export type FetchedItem = {
  externalId: string
  name: string
  url: string
  icon: string | null
  artist: string | null
  genre: string | null
  // count系チャートの計測値(はてブならブックマーク数)
  value?: number
}

// rank: 順位の上昇で判定(App Store)/ count: 数値の伸びで判定(はてブ)
export type ChartKind = 'rank' | 'count'

export type Chart = {
  id: string
  source: string
  kind: ChartKind
  label: string
  fetch: () => Promise<FetchedItem[]>
}
