// GitHub Actionsで実行: 各取得元からデータを取得してWorkerの /ingest に送る
import { charts } from '../src/charts.ts'

const url = process.env.INGEST_URL
const token = process.env.INGEST_TOKEN
if (!url || !token) throw new Error('INGEST_URL / INGEST_TOKEN が未設定です')

// Actionsのcronは数分〜数十分遅れるので、1回分の観測時刻を時単位に丸めて揃える
const observedAt = Math.floor(Date.now() / 3_600_000) * 3600

const results = []
for (const c of charts) {
  try {
    results.push({ chart: c.id, items: await c.fetch() })
  } catch (e) {
    results.push({ chart: c.id, error: String(e) })
  }
  // はてなは繰り返しアクセス時に数秒あけるよう求めている
  await new Promise((r) => setTimeout(r, c.source === 'hatena' ? 3000 : 500))
}
console.log(results.map((r) => `${r.chart}: ${r.items ? r.items.length + '件' : r.error}`).join('\n'))

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ observedAt, results }),
})
const text = await res.text()
console.log(`ingest ${res.status}: ${text}`)
if (!res.ok) process.exit(1)
const summary = JSON.parse(text) as { failed: string[] }
if (summary.failed.length) process.exit(1)
