import Anthropic from '@anthropic-ai/sdk'
import { chartLabel, chartOf, rankOut } from './charts'

const MODEL = 'claude-sonnet-5-5'
const CACHE_SEC = 24 * 3600

export type Background = { summary: string; sources: { url: string; title: string }[]; cached: boolean }

type ItemRow = {
  name: string
  url: string
  artist: string | null
  genre: string | null
  rank: number
  prev_rank: number | null
  value: number | null
  prev_value: number | null
}

export class BackgroundError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 429 | 502,
  ) {
    super(message)
  }
}

export async function getBackground(env: Env, chart: string, itemId: number, now: number): Promise<Background> {
  const c = chartOf(chart)
  if (!c) throw new BackgroundError('unknown chart', 400)

  const cached = await env.DB.prepare(`SELECT summary, sources FROM backgrounds WHERE chart = ?1 AND item_id = ?2 AND created_at >= ?3`)
    .bind(chart, itemId, now - CACHE_SEC)
    .first<{ summary: string; sources: string }>()
  if (cached) return { summary: cached.summary, sources: JSON.parse(cached.sources), cached: true }

  // 公開ページから叩けるため、1日(JST)の生成回数に上限を設けてAPIクレジットの使い過ぎを防ぐ
  const dayStart = Math.floor((now + 9 * 3600) / 86400) * 86400 - 9 * 3600
  const used = await env.DB.prepare(`SELECT COUNT(*) n FROM backgrounds WHERE created_at >= ?1`).bind(dayStart).first<number>('n')
  if ((used ?? 0) >= (Number(env.BACKGROUND_DAILY_LIMIT) || 30))
    throw new BackgroundError('本日の生成上限に達しました。明日またお試しください', 429)

  const item = await env.DB.prepare(
    `SELECT i.name, i.url, i.artist, i.genre, s.rank, s.prev_rank, s.value, s.prev_value
     FROM items i JOIN signals s ON s.item_id = i.id
     WHERE i.id = ?1 AND s.chart = ?2 ORDER BY s.observed_at DESC LIMIT 1`,
  )
    .bind(itemId, chart)
    .first<ItemRow>()
  if (!item) throw new BackgroundError('item not found', 404)

  const result = await generate(env, chart, item, now)
  await env.DB.prepare(`INSERT OR REPLACE INTO backgrounds (chart, item_id, created_at, summary, sources) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(chart, itemId, now, result.summary, JSON.stringify(result.sources))
    .run()
  return { ...result, cached: false }
}

function movement(chart: string, item: ItemRow) {
  if (chartOf(chart)?.kind === 'count') return `${item.prev_value ?? '不明'} → ${item.value ?? 0}`
  const out = rankOut(chart)
  const r = (x: number | null) => (x === null ? '不明' : x >= out ? '圏外' : `${x}位`)
  return `${r(item.prev_rank)} → ${r(item.rank)}`
}

async function generate(env: Env, chart: string, item: ItemRow, now: number) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const today = new Date(now * 1000).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const prompt = `個人開発者向けのトレンド調査ツールで、次の項目がこの24時間で急に伸びました。なぜ伸びているのかを調べて説明してください。

- 取得元: ${chartLabel(chart)}
- 名前: ${item.name}
- URL: ${item.url}
${item.artist ? `- 提供元・著者: ${item.artist}\n` : ''}${item.genre ? `- ジャンル: ${item.genre}\n` : ''}- 24時間の動き: ${movement(chart, item)}
- 今日の日付: ${today}

調べ方:
- 記事・リポジトリ・投稿の場合は、まずURLの中身を読んでください。中身そのものが伸びている理由であることが多いです。
- アプリや検索ワードの場合は、最近のニュース・アップデート・SNSでの話題をWeb検索で探してください。今日から2週間以内の情報を優先し、古い記事しか見つからない場合はそれを今回の理由として扱わないでください。
- 根拠が見つからなければ推測で埋めず、「はっきりした理由は見つかりませんでした」と書いてください。

次の3行だけを、この形式のまま出力してください。各行80字以内、前置きや見出しは不要です。
何か: (それが何かを1文で)
なぜ今: (伸びている理由・きっかけを、根拠とともに1〜2文で)
切り口: (個人開発者がアプリやサービスのネタにするならどこを狙えるか1文で)`

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }]
  let response: Anthropic.Beta.BetaMessage | undefined
  // Web検索が長引くと pause_turn で止まるので、続きを促して再開する
  for (let i = 0; i < 4; i++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 5,
          user_location: { type: 'approximate', country: 'JP', timezone: 'Asia/Tokyo' },
        },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2 },
      ],
      messages,
    })
    if (response.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: response.content })
  }
  if (!response || response.stop_reason === 'refusal') throw new BackgroundError('この項目は説明を生成できませんでした', 502)
  if (response.stop_reason === 'pause_turn') throw new BackgroundError('調査が時間内に終わりませんでした', 502)

  // ツールを使う合間の途中経過の文を混ぜないよう、最後のツール結果より後のテキストだけを答えとして読む
  const lastTool = response.content.findLastIndex((b) => b.type !== 'text')
  const summary = response.content
    .slice(lastTool + 1)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .split('\n')
    // 見出しを太字や箇条書きで書くことがあるので記号を落としてから判定する
    .map((l) => l.replace(/\*\*/g, '').replace(/^[\s\-・*#>]+/, '').trim())
    .filter((l) => /^(何か|なぜ今|切り口)\s*[:：]/.test(l))
    .map((l) => l.replace(/^(何か|なぜ今|切り口)\s*[:：]\s*/, '$1: '))
    .join('\n')
  if (!summary) throw new BackgroundError('説明の生成に失敗しました', 502)

  // 新しいWeb検索は結果を内部で絞り込むため本文に引用が付かないことがある。読んだページ→検索結果の順で出典にする
  const sources = new Map<string, string>()
  const add = (url: string, title: string | null) => {
    if (url !== item.url && !sources.has(url)) sources.set(url, title || new URL(url).hostname)
  }
  for (const b of response.content) {
    if (b.type === 'text') for (const c of b.citations ?? []) if (c.type === 'web_search_result_location') add(c.url, c.title)
    if (b.type === 'web_fetch_tool_result' && b.content.type === 'web_fetch_result') add(b.content.url, b.content.content.title ?? null)
  }
  for (const b of response.content)
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content.slice(0, 2)) add(r.url, r.title)

  return { summary, sources: [...sources].slice(0, 3).map(([url, title]) => ({ url, title })) }
}
