import { fetchItems, tag } from './rss.ts'
import type { Chart } from './types'

// "1,000+" のような概数を数値にする
const traffic = (s: string | null) => Number((s ?? '0').replace(/[^\d]/g, '')) || 0

// 1回に直近1時間ほどの10件しか返らないため、このチャートだけ毎時取得する(.github/workflows/fetch-hourly.yml)
export const googleTrendsCharts: Chart[] = [
  {
    id: 'googletrends:jp:all',
    source: 'googletrends',
    kind: 'count',
    label: 'Googleトレンド 急上昇',
    fetch: async () =>
      (await fetchItems('https://trends.google.co.jp/trending/rss?geo=JP', 'google trends')).map((it) => {
        const keyword = tag(it, 'title')!
        return {
          externalId: keyword,
          name: keyword,
          url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
          icon: null,
          artist: tag(it, 'ht:news_item_source'),
          genre: null,
          value: traffic(tag(it, 'ht:approx_traffic')),
        }
      }),
  },
]
