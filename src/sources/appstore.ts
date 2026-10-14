import type { Chart, FetchedItem } from './types'

const SOURCE = 'appstore'

// 新RSS(rss.marketingtools.apple.com)はカテゴリ指定とトップセールスに非対応のため旧RSSを主に使う
const legacyUrl = (feed: string, genre: number | null) =>
  `https://itunes.apple.com/jp/rss/${feed}/limit=100${genre ? `/genre=${genre}` : ''}/json`

type LegacyEntry = {
  id: { label: string; attributes: { 'im:id': string } }
  'im:name': { label: string }
  'im:image'?: { label: string }[]
  'im:artist'?: { label: string }
  category?: { attributes: { label: string } }
}

async function fetchLegacy(feed: string, genre: number | null): Promise<FetchedItem[]> {
  const res = await fetch(legacyUrl(feed, genre))
  if (!res.ok) throw new Error(`legacy RSS ${res.status}`)
  const json = (await res.json()) as { feed: { entry?: LegacyEntry[] } }
  const entries = json.feed.entry ?? []
  if (entries.length === 0) throw new Error('legacy RSS returned 0 entries')
  return entries.map((e) => ({
    externalId: e.id.attributes['im:id'],
    name: e['im:name'].label,
    url: e.id.label.replace(/\?uo=\d+$/, ''),
    icon: e['im:image']?.at(-1)?.label ?? null,
    artist: e['im:artist']?.label ?? null,
    genre: e.category?.attributes.label ?? null,
  }))
}

type NewEntry = { id: string; name: string; url: string; artworkUrl100: string; artistName: string }

async function fetchNewTopFree(): Promise<FetchedItem[]> {
  const res = await fetch('https://rss.marketingtools.apple.com/api/v2/jp/apps/top-free/100/apps.json')
  if (!res.ok) throw new Error(`new RSS ${res.status}`)
  const json = (await res.json()) as { feed: { results: NewEntry[] } }
  return json.feed.results.map((e) => ({
    externalId: e.id,
    name: e.name,
    url: e.url,
    icon: e.artworkUrl100,
    artist: e.artistName,
    genre: null,
  }))
}

const GENRES: [number | null, string][] = [
  [null, '総合'],
  [6014, 'ゲーム'],
  [6005, 'ソーシャル'],
  [6016, 'エンタメ'],
  [6008, '写真/ビデオ'],
  [6007, '仕事効率化'],
  [6012, 'ライフスタイル'],
  [6017, '教育'],
  [6024, 'ショッピング'],
]

const FEEDS = [
  { key: 'free', feed: 'topfreeapplications', label: '無料' },
  { key: 'grossing', feed: 'topgrossingapplications', label: 'セールス' },
]

export const appstoreCharts: Chart[] = FEEDS.flatMap(({ key, feed, label }) =>
  GENRES.map(([genre, genreLabel]) => ({
    id: `${SOURCE}:jp:${key}:${genre ?? 'all'}`,
    source: SOURCE,
    kind: 'rank' as const,
    label: `App Store ${label}・${genreLabel}`,
    fetch:
      key === 'free' && genre === null
        ? () => fetchLegacy(feed, genre).catch(() => fetchNewTopFree())
        : () => fetchLegacy(feed, genre),
  })),
)
