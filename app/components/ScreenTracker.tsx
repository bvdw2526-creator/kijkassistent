'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Telt welke schermen ingelogde gebruikers openen (tabel screen_visits, zie 20261105_screen_visits.sql), voor het blok
// "Advies of ontdekken" in het beheer-dashboard. Alleen het soort scherm, geen titels of zoektermen. Hetzelfde scherm
// binnen een half uur telt niet opnieuw, zodat heen en weer tikken het beeld niet vertekent.
const AGAIN_MS = 30 * 60 * 1000

const SCREENS: [prefix: string, screen: string][] = [
  ['/onboarding', 'zoeken'], // de database maakt hier 'starthulp' van zolang de starthulp niet is afgerond
  ['/watchlist', 'kijklijst'],
  ['/profiel', 'stats'],
  ['/settings', 'instellingen'],
  ['/nieuw', 'nieuw'],
  ['/persoon/', 'persoon'],
  ['/top-100', 'top100'],
  ['/videotheek', 'videotheek'],
  ['/tip', 'tip'],
  ['/import', 'import'],
  ['/verborgen', 'verborgen'],
]

function screenFor(pathname: string): string | null {
  if (pathname === '/') return 'voor_jou'
  return SCREENS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null
}

// Onthouden in sessionStorage, zodat ook een herlaadde pagina binnen het half uur niet opnieuw telt. Lukt dat niet
// (privévenster, geblokkeerde opslag), dan alleen in het geheugen.
const STORAGE_KEY = 'ka-screen-logged'
const lastLogged = new Map<string, number>()

function lastTime(screen: string): number {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') as Record<string, number>
    return Math.max(saved[screen] ?? 0, lastLogged.get(screen) ?? 0)
  } catch {
    return lastLogged.get(screen) ?? 0
  }
}

function remember(screen: string, time: number) {
  lastLogged.set(screen, time)
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') as Record<string, number>
    saved[screen] = time
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {}
}

export default function ScreenTracker() {
  const pathname = usePathname()

  useEffect(() => {
    const screen = screenFor(pathname)
    if (!screen) return
    const now = Date.now()
    if (now - lastTime(screen) < AGAIN_MS) return
    // Meteen vastleggen, vóór het wachten op de sessie: anders tellen twee snelle aanroepen (bv. React die een effect in
    // de ontwikkelversie twee keer draait) allebei.
    const previous = lastTime(screen)
    remember(screen, now)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        remember(screen, previous) // niet ingelogd: niets geteld, dus na inloggen wel meteen tellen
        return
      }
      supabase.rpc('log_screen_visit', { p_screen: screen }).then(({ error }) => {
        if (error) console.warn('Schermgebruik opslaan mislukt:', error.message)
      })
    })
  }, [pathname])

  return null
}
