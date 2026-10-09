import { chartLabel } from './charts'
import { recentErrors, topSignals, type Row } from './queries'

const move = (r: Row) =>
  r.is_new ? '🆕 新規ランクイン → ' : r.prev_rank && r.prev_rank > r.rank ? `${r.prev_rank > 100 ? '圏外' : r.prev_rank + '位'}→` : ''

export async function sendDigest(env: Env, now: number, appUrl: string | null) {
  const rows = await topSignals(env.DB, {
    chart: 'all',
    period: '24h',
    minScore: 0.01,
    limit: Number(env.DIGEST_SIZE) || 10,
    now,
  })
  const errors = await recentErrors(env.DB, now)

  const lines = rows.map(
    (r, i) =>
      `${i + 1}. <${r.url}|${escapeMrkdwn(r.name)}>  ${move(r)}*${r.rank}位*  _${chartLabel(r.chart)}_  (score ${r.score.toFixed(2)})`,
  )
  const text = [
    `*今朝の急上昇アプリ* (${rows.length}件)`,
    ...(lines.length ? lines : ['該当なし(履歴が溜まるまでは出ません)']),
    ...(errors.length ? [`:warning: 直近24時間の取得エラー ${errors.length}件`] : []),
    ...(appUrl ? [`<${appUrl}|一覧を開く>`] : []),
  ].join('\n')

  if (!env.SLACK_WEBHOOK_URL) {
    console.log('SLACK_WEBHOOK_URL 未設定のため送信せず\n' + text)
    return
  }
  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
  })
  if (!res.ok) throw new Error(`Slack ${res.status}: ${await res.text()}`)
}

const escapeMrkdwn = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
