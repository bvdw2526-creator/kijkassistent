// Eén gezamenlijke deadline voor al het live ophalen (TMDB) binnen een berekening. Elke ophaalstap heeft zijn eigen
// tijdsbudget (LIVE_FETCH_BUDGET_MS en dergelijke), maar die stappen lopen na elkaar: bij een lege tussenopslag konden ze
// samen boven de 60 seconden van Vercel uitkomen, waarna de functie hard werd afgebroken en de nieuwe lijst niet werd
// opgeslagen (23 okt 2026: Samen-berekening na 60 s afgebroken, de volgende poging was in 22 s klaar). Binnen
// withLiveDeadline stopt elke ophaalstap ook als de gezamenlijke deadline voorbij is; wat dan nog ontbrak, haalt de
// volgende berekening op.
//
// AsyncLocalStorage, zodat de deadline alleen geldt voor de aanvraag die hem zette, ook als Vercel meerdere aanvragen in
// dezelfde instantie afhandelt.
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

const deadlineStore = new AsyncLocalStorage<number>()

// Zoveel tijd krijgt het live ophalen in een berekening van Voor jou of Samen, gerekend vanaf de start. Ruim onder de 60
// seconden van Vercel, zodat er tijd overblijft om de lijst samen te stellen en op te slaan.
export const LIVE_DEADLINE_MS = 40_000

export function withLiveDeadline<T>(deadlineAt: number, fn: () => Promise<T>): Promise<T> {
  return deadlineStore.run(deadlineAt, fn)
}

// true als er een gezamenlijke deadline geldt en die voorbij is.
export function pastLiveDeadline(): boolean {
  const deadlineAt = deadlineStore.getStore()
  return deadlineAt !== undefined && Date.now() > deadlineAt
}
