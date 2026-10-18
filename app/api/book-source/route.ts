import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'

// Welk boek achter een boekverfilming zit. TMDB weet alleen dát het een boekverfilming is
// (trefwoord 818), dus we vragen het Wikidata-nummer op bij TMDB en zoeken daar "gebaseerd op"
// (P144) met de schrijver (P50). Getest op de 60 populairste boekverfilmingen: bij 51 gevonden,
// de missers waren vooral gloednieuwe titels en verzamelseries. Niets gevonden = lege lijst,
// dan blijft alleen het label "Gebaseerd op een boek" staan.
// Bewust de gewone Wikidata-API (wbgetentities) en niet de SPARQL-dienst: die deed er soms
// 4–20 seconden over, deze drie kleine aanroepen samen rond een seconde.
const CACHE_SECONDS = 60 * 60 * 24 * 7
const MAX_BOOKS = 2
// Boekenreeks, romancyclus, literaire trilogie: alleen gebruiken als er van die schrijver
// geen los boek bij staat (Silo → Wool in plaats van de reeks "Silo").
const SERIES_TYPES = new Set(['Q277759', 'Q1667921', 'Q13593966', 'Q7725310'])

// url: het Wikipedia-artikel over het boek (Nederlands, anders Engels), of null.
type Book = { title: string; authors: string[]; url: string | null }
type Entity = {
  labels?: Record<string, { value: string }>
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string } } } }[]>
  sitelinks?: Record<string, { title: string }>
}

const isQid = (value: string) => /^Q\d+$/.test(value)
const claimIds = (entity: Entity | undefined, property: string): string[] =>
  (entity?.claims?.[property] || []).map((c) => c.mainsnak?.datavalue?.value?.id || '').filter(isQid)
const label = (entity: Entity | undefined) => entity?.labels?.nl?.value || entity?.labels?.en?.value || ''
function wikipediaUrl(entity: Entity | undefined): string | null {
  for (const lang of ['nl', 'en']) {
    const title = entity?.sitelinks?.[`${lang}wiki`]?.title
    if (title) return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  }
  return null
}

async function getEntities(ids: string[], props: string): Promise<Record<string, Entity>> {
  const res = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${ids.join('|')}&props=${props}&languages=nl|en&sitefilter=nlwiki|enwiki`,
    {
      headers: { 'User-Agent': 'Kijkassistent/1.0 (https://www.kijkassistent.nl)' },
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(5000),
    }
  )
  if (!res.ok) throw new Error(`Wikidata gaf status ${res.status}`)
  return (await res.json()).entities || {}
}

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'book-source', LIMITS.titleInfo)
  if (!guard.ok) return guard.response

  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ books: [] })

  try {
    const idsRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/external_ids`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!idsRes.ok) return NextResponse.json({ books: [] })
    const wikidataId: string = (await idsRes.json()).wikidata_id || ''
    if (!isQid(wikidataId)) return NextResponse.json({ books: [] })

    const film = (await getEntities([wikidataId], 'claims'))[wikidataId]
    const sourceIds = claimIds(film, 'P144').slice(0, 10)
    if (sourceIds.length === 0) return NextResponse.json({ books: [] })
    const sources = await getEntities(sourceIds, 'labels|claims|sitelinks')
    const authorIds = Array.from(new Set(sourceIds.flatMap((s) => claimIds(sources[s], 'P50')))).slice(0, 20)
    // Alleen bronnen mét schrijver: dat sluit o.a. de musical bij Wicked en strips zonder
    // vermelde maker uit.
    if (authorIds.length === 0) return NextResponse.json({ books: [] })
    const authors = await getEntities(authorIds, 'labels')

    const candidates = sourceIds
      .map((s) => ({
        title: label(sources[s]),
        authors: claimIds(sources[s], 'P50').map((a) => label(authors[a])).filter(Boolean),
        url: wikipediaUrl(sources[s]),
        isSeries: claimIds(sources[s], 'P31').some((t) => SERIES_TYPES.has(t)),
      }))
      .filter((b) => b.title && b.authors.length > 0)
      .sort((a, b) => Number(a.isSeries) - Number(b.isSeries))

    // Per schrijver één boek, losse boeken vóór reeksen (2001: A Space Odyssey heeft twee
    // verhalen van Clarke; Silo heeft zowel Wool als de reeks).
    const seenAuthors = new Set<string>()
    const books: Book[] = []
    for (const b of candidates) {
      if (b.authors.some((a) => seenAuthors.has(a))) continue
      b.authors.forEach((a) => seenAuthors.add(a))
      books.push({ title: b.title, authors: b.authors, url: b.url })
      if (books.length >= MAX_BOOKS) break
    }

    return NextResponse.json({ books })
  } catch {
    return NextResponse.json({ books: [] })
  }
}
