import { chartLabel, rankOut } from './charts'
import { recentErrors, topSignals, type Row } from './queries'

const SECTIONS = [
  { prefix: 'appstore:', title: 'App Store' },
  { prefix: 'hatena:', title: 'はてブ' },
  { prefix: 'zenn:', title: 'Zenn' },
  { prefix: 'googletrends:', title: 'Googleトレンド' },
  { prefix: 'hn:', title: 'Hacker News' },
  { prefix: 'github:', title: 'GitHub' },
]

const move = (r: Row) => {
  if (r.chart.startsWith('hatena:')) return `ブクマ ${r.prev_value ?? 0}→*${r.value ?? 0}*`
  if (r.chart.startsWith('googletrends:')) return `検索数 *${(r.value ?? 0).toLocaleString()}+*`
  if (r.chart.startsWith('hn:')) return `${r.prev_value ?? 0}→*${r.value ?? 0}pt*`
  if (r.chart.startsWith('github:')) return `★${r.prev_value ?? 0}→*${r.value ?? 0}*`
  const out = rankOut(r.chart)
  const from = r.is_new ? '🆕 圏外→' : r.prev_rank && r.prev_rank > r.rank ? `${r.prev_rank >= out ? '圏外' : r.prev_rank + '位'}→` : ''
  return `${from}*${r.rank}位*`
}

export async function sendDigest(env: Env, now: number, appUrl: string | null) {
  // 取得元ごとにスコアの出方が違い、混ぜると数の大きいGoogleトレンドが上位を埋めるため、取得元ごとに上位N件を出す
  const perSource = Number(env.DIGEST_PER_SOURCE) || 3
  const [errors, ...tops] = await Promise.all([
    recentErrors(env.DB, now),
    ...SECTIONS.map(({ prefix }) => topSignals(env.DB, { chart: prefix, period: '1d', minScore: 0.01, limit: perSource, now })),
  ])

  const sections = SECTIONS.flatMap(({ title }, i) => {
    const top = tops[i]
    if (top.length === 0) return []
    return [
      `*${title}*`,
      ...top.map(
        (r, i) =>
          `${i + 1}. <${r.url}|${escapeMrkdwn(r.name)}>  ${move(r)}  _${chartLabel(r.chart)}_  (score ${r.score.toFixed(2)})`,
      ),
    ]
  })
  const text = [
    '*今朝の急上昇*(直近24時間)',
    ...(sections.length ? sections : ['該当なし(履歴が溜まるまでは出ません)']),
    ...(errors.length ? [`:warning: 直近24時間の取得エラー ${errors.length}件`] : []),
    ...(appUrl ? [`<${appUrl}|一覧を開く>`] : []),
  ].join('\n')

  if (!env.SLACK_WEBHOOK_URL) throw new Error('SLACK_WEBHOOK_URL が未設定のため送信できません\n' + text)
  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
  })
  // Webhook以外のURLでも200は返り得るので、Slack固有の応答本文 "ok" まで確認する
  const body = await res.text()
  if (!res.ok || body !== 'ok') throw new Error(`Slack ${res.status}: ${body.slice(0, 200)}`)
}

const escapeMrkdwn = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
