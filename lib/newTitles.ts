// "Nieuw"-label op Voor jou: titels die er sinds je vorige bezoek bij zijn gekomen. Alles staat alleen op dit apparaat
// (localStorage per gebruiker); een eerste bezoek toont geen labels, want dan is alles nieuw.
//
// Per bezoek (browsersessie) staat de vergelijkingslijst vast: wat je aan het begin van dit bezoek al kende. Zo blijft
// een "Nieuw"-label staan als je even naar een andere pagina gaat en terugkomt, en verdwijnt het pas bij je volgende bezoek.

const SEEN_KEY = (userId: string) => `kijkassistent:seenrecs:${userId}`
const BASELINE_KEY = (userId: string) => `kijkassistent:newbase:${userId}`
// Waarde van de vergelijkingslijst als er bij de start van dit bezoek nog niets onthouden was (eerste bezoek).
const NO_BASELINE = 'none'
// Zoveel titels onthouden we maximaal (de nieuwste blijven).
const MAX_SEEN = 800

function readList(storage: Storage | undefined, key: string): string[] | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw || raw === NO_BASELINE) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

// Welke van de huidige titels zijn nieuw ten opzichte van het begin van dit bezoek. Alleen lezen.
export function findNewKeys(userId: string, currentKeys: string[]): Set<string> {
  if (typeof window === 'undefined') return new Set()
  let baseline: string[] | null
  try {
    const session = window.sessionStorage.getItem(BASELINE_KEY(userId))
    // Eerste bezoek: geen labels. Zonder vastgelegde lijst (nog niets onthouden in dit bezoek) kijken we naar wat er staat.
    baseline = session === NO_BASELINE ? null : session !== null ? readList(window.sessionStorage, BASELINE_KEY(userId)) : readList(window.localStorage, SEEN_KEY(userId))
  } catch {
    baseline = null
  }
  if (!baseline) return new Set()
  const known = new Set(baseline)
  return new Set(currentKeys.filter((k) => !known.has(k)))
}

// Legt vast wat je nu hebt gezien. De eerste keer in een bezoek wordt eerst de vergelijkingslijst vastgezet.
export function rememberSeen(userId: string, currentKeys: string[]): void {
  if (typeof window === 'undefined' || currentKeys.length === 0) return
  try {
    const current = Array.from(new Set(currentKeys))
    const stored = readList(window.localStorage, SEEN_KEY(userId))
    if (window.sessionStorage.getItem(BASELINE_KEY(userId)) === null) {
      window.sessionStorage.setItem(BASELINE_KEY(userId), stored ? JSON.stringify(stored) : NO_BASELINE)
    }
    const currentSet = new Set(current)
    const merged = [...(stored ?? []).filter((k) => !currentSet.has(k)), ...current].slice(-MAX_SEEN)
    window.localStorage.setItem(SEEN_KEY(userId), JSON.stringify(merged))
  } catch {
    // Geen opslag beschikbaar (bv. privénavigatie): dan zijn er gewoon geen labels.
  }
}
