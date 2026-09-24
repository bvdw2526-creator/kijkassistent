// Het lezen van een Letterboxd-export (de zip uit Instellingen → Data → Export your data),
// volledig in de browser: het bestand zelf verlaat je computer niet.
import { unzipSync, strFromU8 } from 'fflate'

export interface LbFilm {
  name: string
  year: number | null
  // Datum waarop de film is beoordeeld of gezien (YYYY-MM-DD), zoals Letterboxd die bewaart.
  date: string
  uri: string
  // Sterren van 0.5 tot 5; null bij films zonder beoordeling (watched, watchlist).
  rating: number | null
}

export interface LbExport {
  ratings: LbFilm[]
  watched: LbFilm[]
  watchlist: LbFilm[]
}

// Wat er met een aantal sterren gebeurt bij het importeren.
export type StarAction = 'dislike' | 'ok' | 'love' | 'favorite' | 'skip'

export const STAR_VALUES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const

export const STAR_ACTION_LABELS: Record<StarAction, string> = {
  dislike: 'Niet voor mij',
  ok: 'Was oké',
  love: 'Zeker meer zoals dit',
  favorite: 'Favoriet',
  skip: 'Overslaan',
}

// Voorstel: tot 2 sterren "niet voor mij", 2½ tot en met 4 "was oké", 4½ "zeker meer zoals dit",
// en 5 sterren een favoriet. De gebruiker past dit in de wizard aan.
export const DEFAULT_STAR_MAP: Record<string, StarAction> = {
  '0.5': 'dislike',
  '1': 'dislike',
  '1.5': 'dislike',
  '2': 'dislike',
  '2.5': 'ok',
  '3': 'ok',
  '3.5': 'ok',
  '4': 'ok',
  '4.5': 'love',
  '5': 'favorite',
}

export function starKey(stars: number): string {
  return String(stars)
}

// Een CSV-parser die met aanhalingstekens, komma's en regeleinden binnen een veld overweg kan
// (filmtitels bevatten ze regelmatig).
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

export function parseFilms(csv: string): LbFilm[] {
  const rows = parseCsv(csv)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const iDate = col('date')
  const iName = col('name')
  const iYear = col('year')
  const iUri = col('letterboxd uri')
  const iRating = col('rating')
  if (iName === -1) return []

  const films: LbFilm[] = []
  for (const r of rows.slice(1)) {
    const name = (r[iName] ?? '').trim()
    if (!name) continue
    const year = parseInt(r[iYear] ?? '', 10)
    const rating = iRating === -1 ? NaN : parseFloat(r[iRating] ?? '')
    films.push({
      name,
      year: Number.isFinite(year) ? year : null,
      date: (r[iDate] ?? '').trim(),
      uri: (r[iUri] ?? '').trim() || `${name}|${year}`,
      rating: Number.isFinite(rating) ? rating : null,
    })
  }
  return films
}

// Alleen de drie bestanden die we nodig hebben worden uitgepakt; de rest van de zip (reviews,
// dagboek, lijsten, verwijderde items) blijft dicht.
const WANTED = /(^|\/)(ratings|watched|watchlist)\.csv$/i
const IGNORED_FOLDERS = /(^|\/)(deleted|lists|orphaned|likes)\//i

export async function readLetterboxdFile(file: File): Promise<LbExport> {
  const empty: LbExport = { ratings: [], watched: [], watchlist: [] }

  if (/\.csv$/i.test(file.name)) {
    const films = parseFilms(await file.text())
    // Een los CSV-bestand: met een "Rating"-kolom is het de ratings, zonder is het de gezien-lijst.
    return films.some((f) => f.rating !== null) ? { ...empty, ratings: films } : { ...empty, watched: films }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (f) => WANTED.test(f.name) && !IGNORED_FOLDERS.test(f.name) })
  } catch {
    throw new Error('Dit bestand kon niet als zip worden geopend. Kies de zip die Letterboxd je gaf.')
  }

  const out: LbExport = { ...empty }
  for (const [path, data] of Object.entries(files)) {
    const kind = path.toLowerCase().split('/').pop()!.replace('.csv', '') as keyof LbExport
    out[kind] = parseFilms(strFromU8(data))
  }
  if (out.ratings.length === 0 && out.watched.length === 0 && out.watchlist.length === 0) {
    throw new Error(
      'Geen ratings.csv, watched.csv of watchlist.csv gevonden. Is dit de export uit Letterboxd (Instellingen → Data → Export your data)?'
    )
  }
  return out
}
