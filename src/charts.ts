import { appstoreCharts } from './sources/appstore.ts'
import { hatenaCharts } from './sources/hatena.ts'

export const charts = [...appstoreCharts, ...hatenaCharts]
export const chartOf = (id: string) => charts.find((c) => c.id === id)
export const chartLabel = (id: string) => chartOf(id)?.label ?? id
