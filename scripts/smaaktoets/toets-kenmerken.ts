// Smaaktoets: kenmerken (trefwoorden, regisseur, tijdperk, taal). Rekent met de echte code uit lib/titleFeatures.ts. Voor
// elke beoordeelde titel wordt de smaak opgebouwd uit alle andere beoordelingen van hetzelfde profiel (de titel zelf
// weggelaten), en dan gekeken hoe vaak "zeker leuk" (incl. favoriet) hoger scoort dan "oké" en "niet voor mij".
// "zonder tegenstemmen" = alsof de kenmerken alleen van wat je leuk vond leren (zoals vóór 8 okt 2026).
// Gebruik (vanuit de projectmap, Node 23.6+): node scripts/smaaktoets/toets-kenmerken.ts
// Nodig: data/rated.json (zie export-beoordelingen.sql) en data/features.json (zie fetch-kenmerken.mjs).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type Label = 'F' | 'L' | 'O' | 'D'
type Features = Record<string, unknown> & { keywords: { id: number; name: string }[] }
interface Item {
  id: string
  label: Label
  f: Features
}

const here = dirname(fileURLToPath(import.meta.url))
const tf = await import(pathToFileURL(join(here, '..', '..', 'lib', 'titleFeatures.ts')).href)
const rated: Record<string, string> = JSON.parse(readFileSync(join(here, 'data', 'rated.json'), 'utf8'))
const features: Record<string, Features> = JSON.parse(readFileSync(join(here, 'data', 'features.json'), 'utf8'))

// Zelfde gewichten als de motor: favoriet 3, "zeker leuk" 2 (FAVORITE_SOURCE_WEIGHT / LOVE_SOURCE_WEIGHT).
const POSITIVE_WEIGHT: Record<string, number> = { F: 3, L: 2 }

function huidigeCode(sources: Item[], universe: Features[]) {
  const liked = sources.filter((s) => POSITIVE_WEIGHT[s.label]).map((s) => ({ features: s.f, weight: POSITIVE_WEIGHT[s.label] }))
  const against = {
    disliked: sources.filter((s) => s.label === 'D').map((s) => s.f),
    ok: sources.filter((s) => s.label === 'O').map((s) => s.f),
  }
  const taste = tf.buildFeatureTaste(liked, against, universe)
  return (f: Features) => tf.scoreTitleFeatures(taste, f).score as number
}

function zonderTegenstemmen(sources: Item[], universe: Features[]) {
  const liked = sources.filter((s) => POSITIVE_WEIGHT[s.label]).map((s) => ({ features: s.f, weight: POSITIVE_WEIGHT[s.label] }))
  const taste = tf.buildFeatureTaste(liked, { disliked: [], ok: [] }, universe)
  return (f: Features) => tf.scoreTitleFeatures(taste, f).score as number
}

function trefkans(hoger: number[], lager: number[]) {
  let s = 0
  for (const x of hoger) for (const y of lager) s += x > y ? 1 : x === y ? 0.5 : 0
  return hoger.length && lager.length ? ((100 * s) / (hoger.length * lager.length)).toFixed(1) : '-'
}

function meet(naam: string, bouw: (sources: Item[], universe: Features[]) => (f: Features) => number) {
  const regels = [naam]
  for (const [profiel, lijst] of Object.entries(rated)) {
    const items: Item[] = lijst
      .split(',')
      .map((t) => ({ id: t.slice(0, -1), label: t.slice(-1) as Label, f: features[t.slice(0, -1)] }))
      .filter((i) => i.f)
    const universe = items.map((i) => i.f)
    const scores: Record<'leuk' | 'O' | 'D', number[]> = { leuk: [], O: [], D: [] }
    items.forEach((item, i) => {
      const score = bouw(items.filter((_, j) => j !== i), universe)(item.f)
      scores[item.label === 'F' || item.label === 'L' ? 'leuk' : item.label === 'O' ? 'O' : 'D'].push(score)
    })
    regels.push(
      `  ${profiel}: leuk>niet ${trefkans(scores.leuk, scores.D)}  leuk>oké ${trefkans(scores.leuk, scores.O)}  oké>niet ${trefkans(scores.O, scores.D)}  (${items.length} titels)`
    )
  }
  console.log(regels.join('\n'))
}

meet('Huidige code (lib/titleFeatures.ts)', huidigeCode)
meet('Zonder tegenstemmen (alleen leren van wat je leuk vond)', zonderTegenstemmen)
