// Workers/Nodeの両方で動かすためDOMParserを使わず、RSSを正規表現で読む
export const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim()

export const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : null
}

export async function fetchItems(url: string, label: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'find-buzz (personal use)' } })
  if (!res.ok) throw new Error(`${label} RSS ${res.status}`)
  const items = [...(await res.text()).matchAll(/<item[ >][\s\S]*?<\/item>/g)].map((m) => m[0])
  if (items.length === 0) throw new Error(`${label} RSS returned 0 items`)
  return items
}
