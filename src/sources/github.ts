import type { Chart, FetchedItem } from './types'

type Repo = { id: number; full_name: string; description: string | null; html_url: string; stargazers_count: number; language: string | null; owner: { avatar_url: string } }

// Actions上ではGITHUB_TOKENで認証する(未認証だと検索APIは10回/分)
const token = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GITHUB_TOKEN

async function fetchNewRepos(): Promise<FetchedItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const t = token()
  const res = await fetch(`https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=50`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'find-buzz',
      ...(t ? { authorization: `Bearer ${t}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`github search ${res.status}`)
  const { items } = (await res.json()) as { items: Repo[] }
  return items.map((r) => ({
    externalId: String(r.id),
    name: r.description ? `${r.full_name}: ${r.description.slice(0, 80)}` : r.full_name,
    url: r.html_url,
    icon: r.owner.avatar_url,
    artist: r.full_name.split('/')[0],
    genre: r.language,
    value: r.stargazers_count,
  }))
}

export const githubCharts: Chart[] = [
  { id: 'github:new-repos', source: 'github', kind: 'count', label: 'GitHub 新着リポジトリ(7日以内)', fetch: fetchNewRepos },
]
