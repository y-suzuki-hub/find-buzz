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
  news_json: string | null
  external_id: string
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
    `SELECT i.name, i.url, i.artist, i.genre, i.news_json, i.external_id, s.rank, s.prev_rank, s.value, s.prev_value
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

// 取得元によって「伸びた理由」の在りかが違う。記事やリポジトリは中身と反応そのものが理由で、外部のきっかけを探すと「見つからない」になりやすい
function howToResearch(chart: string, item: ItemRow) {
  const source = chart.split(':')[0]
  if (source === 'hatena') {
    const entry = `https://b.hatena.ne.jp/entry/${item.url.startsWith('https://') ? 's/' : ''}${item.url.replace(/^https?:\/\//, '')}`
    return `- 記事のURLを読み、中身のどこが読者に刺さったか(新しさ・意外さ・実用性・共感・時事との関係)を書いてください。
- はてなブックマークのコメント欄 ${entry} も読み、読者が何に反応しているかを理由に含めてください。
- 外部のきっかけ(ニュースやSNS)は探さなくてかまいません。`
  }
  if (source === 'zenn')
    return `- 記事のURLを読み、中身のどこが読者に刺さったか(新しさ・意外さ・実用性・時事との関係)を書いてください。
- 外部のきっかけ(ニュースやSNS)は探さなくてかまいません。`
  if (source === 'hn')
    return `- リンク先を読み、中身のどこが注目されたかを書いてください。
- Hacker Newsの議論ページ https://news.ycombinator.com/item?id=${item.external_id} も読み、読者が何に反応しているか(賛否や論点)を理由に含めてください。`
  if (source === 'github')
    return `- リポジトリのページ(README)を読み、誰が作ったか、何ができるか、何が新しいかを書いてください。
- 有名な組織・開発者の公開や、新しいモデル・製品の発表に合わせた公開なら、それを理由として書いてください。必要ならリポジトリ名でWeb検索して、紹介している記事や投稿を探してください。
- 外部のきっかけが見つからなければ、READMEから分かる新しさ・便利さ・手軽さを理由として書いてください(「(推定)」を付けてかまいません)。`
  if (source === 'googletrends')
    return `- 関連ニュースがあれば、まずその見出しから理由を読み取り、必要ならURLの中身を読んでください。
- 関連ニュースが無い、または見出しで分からない場合は、このワードを最近のニュースでWeb検索してください。`
  return `- このアプリについて、最近のニュース・アップデート・テレビやCM・キャンペーン・SNSでの話題をWeb検索で探してください。
- 見つからない場合は、競合アプリの障害や終了、季節要因、関連する出来事など、周辺の要因も検討してください。`
}

async function generate(env: Env, chart: string, item: ItemRow, now: number) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const today = new Date(now * 1000).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const news = (item.news_json ? JSON.parse(item.news_json) : []) as { title: string; url: string; source: string | null }[]
  const newsBlock = news.length
    ? `\n取得元がこの項目に紐づけている関連ニュース(最初の手がかりにしてください):\n${news.map((n) => `- ${n.title}(${n.source ?? '出典不明'}) ${n.url}`).join('\n')}\n`
    : ''
  const prompt = `個人開発者向けのトレンド調査ツールで、次の項目がこの24時間で急に伸びました。なぜ伸びているのかを調べて説明してください。

- 取得元: ${chartLabel(chart)}
- 名前: ${item.name}
- URL: ${item.url}
${item.artist ? `- 提供元・著者: ${item.artist}\n` : ''}${item.genre ? `- ジャンル: ${item.genre}\n` : ''}- 24時間の動き: ${movement(chart, item)}
- 今日の日付: ${today}
${newsBlock}
調べ方:
${howToResearch(chart, item)}

書き方:
- 「なぜ今」は、調べて分かった理由を言い切ってください。確かでない部分は文末に「(推定)」と付けるだけにし、「〜は確認できませんでした」「〜は未確認です」といった断り書きは書かないでください。
- 「不明」と書いてよいのは、URLの中身も関連情報も1つも読めなかったときだけです。そのときは「なぜ今: 不明(〜を調べたが手がかりなし)」と短く書いてください。中身を読めたなら、中身から言える理由を書いてください。
- 古い出来事(今日から2週間より前)を今回の理由にしないでください。

次の3行だけを、この形式のまま出力してください。各行80字以内、前置きや見出しは不要です。
何か: (それが何かを1文で)
なぜ今: (伸びている理由を1〜2文で)
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
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
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
  for (const n of news.slice(0, 2)) add(n.url, n.title)
  for (const b of response.content)
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content.slice(0, 2)) add(r.url, r.title)

  return { summary, sources: [...sources].slice(0, 3).map(([url, title]) => ({ url, title })) }
}
