export type FetchedItem = {
  externalId: string
  name: string
  url: string
  icon: string | null
  artist: string | null
  genre: string | null
}

export type Chart = {
  id: string
  source: string
  label: string
  fetch: () => Promise<FetchedItem[]>
}
