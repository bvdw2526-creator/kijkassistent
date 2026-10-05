// Titels in niet-Latijns schrift (Koreaans, Japans, Chinees, Cyrillisch, enzovoort) vervangen door de Engelse titel.
// TMDB geeft bij language=nl-NL de originele titel terug als er geen Nederlandse vertaling is, en dat is voor de
// meeste Nederlandse gebruikers onleesbaar. Alleen op de server gebruikt, voor de titels die we uiteindelijk tonen.

const NON_LATIN = /[Ͱ-ϿЀ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/
// Zoveel titels per keer (de rest houdt zijn titel); zo blijft het aantal TMDB-aanvragen begrensd.
const MAX_LOOKUPS = 40
const CACHE_SECONDS = 60 * 60 * 24 * 7

export function hasNonLatinTitle(title: string): boolean {
  return NON_LATIN.test(title)
}

async function englishTitle(mediaType: 'movie' | 'tv', id: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?language=en-US`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return null
    const data = await res.json()
    const title: string = data.title || data.name || ''
    // Een Engelse titel die zelf ook niet Latijns is, helpt niet.
    return title && !hasNonLatinTitle(title) ? title : null
  } catch {
    return null
  }
}

export async function withLatinTitles<T extends { id: number; media_type: 'movie' | 'tv'; title: string }>(items: T[]): Promise<T[]> {
  const needFix = items.filter((i) => hasNonLatinTitle(i.title)).slice(0, MAX_LOOKUPS)
  if (needFix.length === 0) return items
  const fixed = new Map<string, string>()
  await Promise.all(
    needFix.map(async (i) => {
      const title = await englishTitle(i.media_type, i.id)
      if (title) fixed.set(`${i.media_type}-${i.id}`, title)
    })
  )
  if (fixed.size === 0) return items
  return items.map((i) => {
    const title = fixed.get(`${i.media_type}-${i.id}`)
    return title ? { ...i, title } : i
  })
}
