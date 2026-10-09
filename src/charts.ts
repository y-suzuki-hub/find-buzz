import { appstoreCharts } from './sources/appstore'

export const charts = [...appstoreCharts]
export const chartLabel = (id: string) => charts.find((c) => c.id === id)?.label ?? id
