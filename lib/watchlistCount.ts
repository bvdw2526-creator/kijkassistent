'use client'

import { useEffect, useState } from 'react'
import { supabase, getCurrentUser } from './supabase'

// Het getalletje bij Kijklijst in het menu onderin: hoeveel titels er op je eigen lijst staan. Gezien = van de lijst af,
// dus het aantal rijen is precies wat je nog wilt kijken. Het getal blijft tussen pagina's bewaard (het menu wordt per
// pagina opnieuw getekend) en wordt bij elke pagina stil ververst.

let count: number | null = null
let addedAt = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export async function refreshWatchlistCount() {
  const user = await getCurrentUser()
  if (!user) {
    if (count !== null) { count = null; emit() }
    return
  }
  const { count: n, error } = await supabase
    .from('watchlist')
    .select('tmdb_id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (error || n === null) return
  if (n !== count) { count = n; emit() }
}

// De kijklijstpagina kent het precieze aantal al, dus zonder extra vraag aan de database.
export function setWatchlistCount(n: number) {
  if (n !== count) { count = n; emit() }
}

// Aanroepen nadat er iets op je kijklijst is gezet: het getal gaat meteen omhoog en het icoon wipt even.
export function watchlistAdded() {
  if (count !== null) count += 1
  addedAt = Date.now()
  emit()
  void refreshWatchlistCount()
}

// bounce: een sleutel die alleen gezet is als er net (binnen 2 s) iets is toegevoegd, zodat het icoon dan wipt en niet
// bij elke nieuwe pagina.
export function useWatchlistCount() {
  const [state, setState] = useState({ count, bounce: 0 })
  useEffect(() => {
    const update = () => setState({ count, bounce: addedAt && Date.now() - addedAt < 2000 ? addedAt : 0 })
    listeners.add(update)
    update()
    void refreshWatchlistCount()
    return () => { listeners.delete(update) }
  }, [])
  return state
}
