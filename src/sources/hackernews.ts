import type { Chart, FetchedItem } from './types'

const API = 'https://hacker-news.firebaseio.com/v0'
const TOP_N = 30

type Story = { id: number; title?: string; url?: string; score?: number; by?: string; dead?: boolean; deleted?: boolean }

// 一覧APIはIDしか返さないので上位N件の詳細を取る。公式APIにレート制限は無いが10件ずつに抑える
async function fetchStories(list: string): Promise<FetchedItem[]> {
  const res = await fetch(`${API}/${list}.json`)
  if (!res.ok) throw new Error(`hacker news ${res.status}`)
  const ids = ((await res.json()) as number[]).slice(0, TOP_N)
  const stories: (Story | null)[] = []
  for (let i = 0; i < ids.length; i += 10) {
    stories.push(
      ...(await Promise.all(ids.slice(i, i + 10).map((id) => fetch(`${API}/item/${id}.json`).then((r) => r.json() as Promise<Story | null>)))),
    )
  }
  return stories
    .filter((s): s is Story => !!s && !s.dead && !s.deleted && !!s.title)
    .map((s) => {
      const discussion = `https://news.ycombinator.com/item?id=${s.id}`
      return {
        externalId: String(s.id),
        name: s.title!,
        url: s.url ?? discussion,
        icon: null,
        artist: s.url ? new URL(s.url).hostname : 'news.ycombinator.com',
        genre: null,
        value: s.score ?? 0,
      }
    })
}

export const hackerNewsCharts: Chart[] = [
  { id: 'hn:show', source: 'hn', kind: 'count', label: 'Hacker News Show HN', fetch: () => fetchStories('showstories') },
  { id: 'hn:top', source: 'hn', kind: 'count', label: 'Hacker News トップ', fetch: () => fetchStories('topstories') },
]
