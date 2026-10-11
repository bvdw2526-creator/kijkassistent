// "Te oud": bij titels van vóór TOO_OLD_BEFORE staat een knop waarmee je een titel wegzet omdat hij je te oud is. Het is
// geen beoordeling; de titel wordt verborgen met reden 'te_oud' (zie de migratie 20261011_te_oud.sql). Na een paar keer
// stelt de app voor oudere titels voortaan weg te laten: dat wordt je grens "Niet ouder dan" (profiles.min_year).

// Titels van vóór dit jaar krijgen de knop.
export const TOO_OLD_BEFORE = 2000
// Na zoveel keer "Te oud" komt de vraag; zeg je nee, dan pas weer na nog eens zoveel keer.
export const TOO_OLD_ASK_AFTER = 3
// De grenzen waaruit je kunt kiezen, in de vraag en bij Instellingen.
export const MIN_YEAR_OPTIONS = [1980, 1990, 2000, 2010]
export const TOO_OLD_REASON = 'te_oud'
// Bij hoeveel keer "Te oud" de vraag het laatst is gesteld; bewaard op het apparaat.
export const TOO_OLD_ASKED_KEY = 'kijkassistent:te-oud-gevraagd'

export function yearOf(releaseDate?: string | null): number | null {
  const year = parseInt((releaseDate ?? '').slice(0, 4), 10)
  return Number.isFinite(year) ? year : null
}

// De grens die we voorstellen: het decennium net boven het midden van wat je wegzette. Zette je 1957, 1972 en 1986
// weg, dan is het midden 1972 en stellen we 1980 voor. Nooit hoger dan TOO_OLD_BEFORE: jongere titels hebben de knop niet.
export function suggestMinYear(years: number[]): number {
  const sorted = [...years].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? TOO_OLD_BEFORE - 1
  const decadeAbove = (Math.floor(median / 10) + 1) * 10
  return Math.max(MIN_YEAR_OPTIONS[0], Math.min(TOO_OLD_BEFORE, decadeAbove))
}
