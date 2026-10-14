import { fetchItems, tag } from './rss.ts'
import type { Chart, FetchedItem } from './types'

const SOURCE = 'hatena'

async function fetchHotentry(path: string): Promise<FetchedItem[]> {
  const items = await fetchItems(`https://b.hatena.ne.jp/${path}`, 'hatena')
  return items.map((it) => {
    const url = tag(it, 'link')!
    return {
      externalId: url,
      name: tag(it, 'title') ?? url,
      url,
      icon: null,
      artist: new URL(url).hostname,
      genre: tag(it, 'dc:subject'),
      value: Number(tag(it, 'hatena:bookmarkcount') ?? 0),
    }
  })
}

const CATEGORIES: [string | null, string][] = [
  [null, '総合'],
  ['it', 'テクノロジー'],
  ['life', '暮らし'],
  ['knowledge', '学び'],
  ['fun', 'おもしろ'],
  ['entertainment', 'エンタメ'],
  ['game', 'アニメとゲーム'],
]

export const hatenaCharts: Chart[] = CATEGORIES.map(([cat, label]) => ({
  id: `${SOURCE}:hotentry:${cat ?? 'all'}`,
  source: SOURCE,
  kind: 'count' as const,
  label: `はてブ 人気・${label}`,
  fetch: () => fetchHotentry(cat ? `hotentry/${cat}.rss` : 'hotentry.rss'),
}))
