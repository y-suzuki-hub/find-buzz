import type { Chart, FetchedItem } from './types'

const SOURCE = 'hatena'

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim()

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : null
}

// Workers/Nodeの両方で動かすためDOMParserを使わず、RSS 1.0の<item>を正規表現で読む
async function fetchHotentry(path: string): Promise<FetchedItem[]> {
  const res = await fetch(`https://b.hatena.ne.jp/${path}`, { headers: { 'user-agent': 'find-buzz (personal use)' } })
  if (!res.ok) throw new Error(`hatena RSS ${res.status}`)
  const xml = await res.text()
  const items = [...xml.matchAll(/<item [^>]*>([\s\S]*?)<\/item>/g)].map((m) => m[1])
  if (items.length === 0) throw new Error('hatena RSS returned 0 items')
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
