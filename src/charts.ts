import { appstoreCharts } from './sources/appstore.ts'
import { googleTrendsCharts } from './sources/googletrends.ts'
import { hatenaCharts } from './sources/hatena.ts'
import { zennCharts } from './sources/zenn.ts'

export const charts = [...appstoreCharts, ...hatenaCharts, ...zennCharts, ...googleTrendsCharts]
export const chartOf = (id: string) => charts.find((c) => c.id === id)
export const chartLabel = (id: string) => chartOf(id)?.label ?? id
export const rankOut = (id: string) => (chartOf(id)?.depth ?? 100) + 1
