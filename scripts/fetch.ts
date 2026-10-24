// GitHub Actionsで実行: 各取得元からデータを取得してWorkerの /ingest に送る
import { charts } from '../src/charts.ts'

const url = process.env.INGEST_URL
const token = process.env.INGEST_TOKEN
if (!url || !token) throw new Error('INGEST_URL / INGEST_TOKEN が未設定です')

// SOURCES=appstore,hatena のように取得元を絞る(未指定なら全部)
const only = process.env.SOURCES?.split(',').map((x) => x.trim())
const targets = charts.filter((c) => !only || only.includes(c.source))

// Actionsのcronは数分〜数十分遅れるので、1回分の観測時刻を時単位に丸めて揃える
const observedAt = Math.floor(Date.now() / 3_600_000) * 3600

const results = []
for (const c of targets) {
  try {
    results.push({ chart: c.id, items: await c.fetch() })
  } catch (e) {
    results.push({ chart: c.id, error: String(e) })
  }
  // はてなは繰り返しアクセス時に数秒あけるよう求めている
  await new Promise((r) => setTimeout(r, c.source === 'hatena' ? 3000 : 500))
}
console.log(results.map((r) => `${r.chart}: ${r.items ? r.items.length + '件' : r.error}`).join('\n'))

async function send(batch: typeof results) {
  const res = await fetch(url!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ observedAt, results: batch }),
  })
  const text = await res.text()
  console.log(`ingest ${res.status}: ${text}`)
  if (!res.ok) process.exit(1)
  return (JSON.parse(text) as { failed: string[] }).failed
}

let failed = await send(results)
// D1が一時的な内部エラーを返すことがあるので、保存に失敗したチャートだけ少し待って送り直す
// (取得自体に失敗したチャートは送り直しても同じなので、失敗のまま残す)
const retry = results.filter((r) => 'items' in r && failed.some((f) => f.startsWith(`${r.chart}: `)))
if (retry.length) {
  await new Promise((r) => setTimeout(r, 15_000))
  failed = [...failed.filter((f) => !retry.some((r) => f.startsWith(`${r.chart}: `))), ...(await send(retry))]
}
if (failed.length) process.exit(1)
