import { fetchItems, tag } from './rss.ts'
import type { Chart } from './types'

// 公式の「Zennのトレンド」RSS。いいね数は含まれないので順位の変化で判定する
export const zennCharts: Chart[] = [
  {
    id: 'zenn:trend:all',
    source: 'zenn',
    kind: 'rank',
    depth: 20,
    label: 'Zenn トレンド',
    fetch: async () =>
      (await fetchItems('https://zenn.dev/feed', 'zenn')).map((it) => {
        const url = tag(it, 'link')!
        return {
          externalId: url,
          name: tag(it, 'title') ?? url,
          url,
          icon: null,
          artist: tag(it, 'dc:creator'),
          genre: null,
        }
      }),
  },
]
