import type { TitleDetails } from './recommendationEngine'

export type DislikedGenre = { id: number; name: string; disliked: number; total: number }

// "Niet jouw ding": genres die je opvallend vaak afkeurt. Gewoon tellen werkt niet — de genres waar je het meest naar kijkt
// (bv. actie) staan dan ook bovenaan bij je afkeuringen. Daarom per genre het deel dat "niet voor mij" kreeg, afgezet tegen
// hoe vaak je gemiddeld afkeurt: pas bij minstens twee keer zo vaak, en minstens 3 afkeuringen in dat genre, is het echt niet
// jouw ding. Gedeeld door de Stats-pagina en "Meer zoals deze".
export function findDislikedGenres(
  watchedKeys: string[],
  dislikedKeys: Set<string>,
  detailsByKey: Map<string, TitleDetails>
): DislikedGenre[] {
  const counts = new Map<number, { name: string; disliked: number; total: number }>()
  for (const key of watchedKeys) {
    const details = detailsByKey.get(key)
    if (!details) continue
    const isDisliked = dislikedKeys.has(key)
    for (const genre of details.genres) {
      const entry = counts.get(genre.id) ?? { name: genre.name, disliked: 0, total: 0 }
      entry.total++
      if (isDisliked) entry.disliked++
      counts.set(genre.id, entry)
    }
  }
  const overallRate = watchedKeys.length > 0 ? dislikedKeys.size / watchedKeys.length : 0
  return Array.from(counts.entries())
    .map(([id, c]) => ({ id, ...c }))
    .filter((g) => g.disliked >= 3 && g.disliked / g.total >= 2 * overallRate)
    .sort((a, b) => b.disliked / b.total - a.disliked / a.total || b.disliked - a.disliked)
}
