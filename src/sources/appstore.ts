import type { Chart, FetchedItem } from './types'

// Apple公式のRSS Generator。旧iTunes RSS(itunes.apple.com/*/rss/*)はrobots.txtで自動取得が禁止されているため使わない。
// 新RSSはカテゴリ指定とトップセールスに対応していないので、無料ランキングの総合だけを取る
const URL = 'https://rss.marketingtools.apple.com/api/v2/jp/apps/top-free/100/apps.json'

type Entry = { id: string; name: string; url: string; artworkUrl100: string; artistName: string; genres?: { name: string }[] }

async function fetchTopFree(): Promise<FetchedItem[]> {
  // 502/504を頻繁に返すので、間隔を空けて最大3回取り直す
  let res = await fetch(URL)
  for (let i = 1; i <= 3 && !res.ok; i++) {
    await new Promise((r) => setTimeout(r, i * 10_000))
    res = await fetch(URL)
  }
  if (!res.ok) throw new Error(`apple RSS ${res.status}`)
  const json = (await res.json()) as { feed: { results: Entry[] } }
  if (!json.feed.results.length) throw new Error('apple RSS returned 0 entries')
  return json.feed.results.map((e) => ({
    externalId: e.id,
    name: e.name,
    url: e.url,
    icon: e.artworkUrl100,
    artist: e.artistName,
    genre: e.genres?.[0]?.name ?? null,
  }))
}

// IDは旧RSS時代と同じにして、これまでの順位の履歴を引き継ぐ
export const appstoreCharts: Chart[] = [
  { id: 'appstore:jp:free:all', source: 'appstore', kind: 'rank', label: 'App Store 無料・総合', fetch: fetchTopFree },
]
