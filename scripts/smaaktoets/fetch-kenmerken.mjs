// Haalt de kenmerken (trefwoorden, regisseurs, jaar, taal) van alle titels in data/rated.json op bij TMDB, op dezelfde
// manier als fetchFeaturesLive in lib/titleFeatures.ts. Alleen lezen bij TMDB; schrijft data/features.json.
// Gebruik (vanuit de projectmap): node scripts/smaaktoets/fetch-kenmerken.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const key = readFileSync(join(root, '.env.local'), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('TMDB_API_KEY='))
  ?.slice('TMDB_API_KEY='.length)
  .trim()
if (!key) throw new Error('Geen TMDB_API_KEY in .env.local')

const rated = JSON.parse(readFileSync(join(here, 'data', 'rated.json'), 'utf8'))
const ids = new Set()
for (const list of Object.values(rated)) for (const tok of list.split(',')) ids.add(tok.slice(0, -1))

const outPath = join(here, 'data', 'features.json')
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {}
const todo = [...ids].filter((id) => !out[id])
console.log(`titels: ${ids.size}, nog op te halen: ${todo.length}`)

async function fetchOne(id) {
  const mediaType = id[0] === 'm' ? 'movie' : 'tv'
  const append = mediaType === 'movie' ? 'keywords,credits' : 'keywords'
  const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id.slice(1)}?language=en-US&append_to_response=${append}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  const keywordList = data.keywords?.keywords || data.keywords?.results || []
  const directors =
    mediaType === 'movie'
      ? (data.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => ({ id: c.id, name: c.name }))
      : (data.created_by || []).map((c) => ({ id: c.id, name: c.name }))
  const year = parseInt((data.release_date || data.first_air_date || '').slice(0, 4), 10)
  return {
    keywords: keywordList.map((k) => ({ id: k.id, name: k.name })),
    directors,
    year: Number.isFinite(year) ? year : null,
    language: data.original_language || null,
    titleEn: data.title || data.name || '',
    overviewEn: data.overview || '',
  }
}

for (let i = 0; i < todo.length; i += 20) {
  const done = await Promise.all(todo.slice(i, i + 20).map(async (id) => [id, await fetchOne(id).catch(() => null)]))
  for (const [id, f] of done) if (f) out[id] = f
}
writeFileSync(outPath, JSON.stringify(out))
console.log(`opgeslagen: ${Object.keys(out).length} titels`)
