// Gebeurtenissen rond een aanbeveling (tabel recommendation_events): welke titels er in beeld kwamen, welke iemand opende en
// welke er zonder oordeel van de kijklijst af gingen. Samen met source_info bij beoordelingen, favorieten en de kijklijst
// geeft dat de trefkans: hoeveel van wat we lieten zien uiteindelijk raak was. Alleen de beheerder kan het lezen.
//
// Alles gaat op de achtergrond en in kleine bundels; lukt het opslaan niet, dan merkt de gebruiker daar niets van.
import { useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'

export type RecommendationEvent = {
  event: 'getoond' | 'geopend' | 'afgehaakt'
  screen: 'voor_jou' | 'kijklijst' | 'onze_lijst'
  mode: string | null
  media_type: 'movie' | 'tv'
  tmdb_id: number
  position?: number | null
  match?: number | null
  upcoming?: boolean
  connection_id?: string | null
  days_on_list?: number | null
}

type Row = Required<RecommendationEvent> & { user_id: string }

// Na zoveel stilte gaat de bundel weg (en meteen als de app naar de achtergrond gaat).
const FLUSH_DELAY_MS = 2000

let queue: Row[] = []
let timer: ReturnType<typeof setTimeout> | null = null
// Wat in dit bezoek al verstuurd is; de database telt dezelfde gebeurtenis ook maar één keer per dag.
const sent = new Set<string>()

function amsterdamDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
}

async function flush() {
  if (timer) clearTimeout(timer)
  timer = null
  if (queue.length === 0) return
  const rows = queue
  queue = []
  const { error } = await supabase
    .from('recommendation_events')
    .upsert(rows, { onConflict: 'user_id,event,screen,mode,media_type,tmdb_id,day', ignoreDuplicates: true })
  if (error) console.warn('Gebeurtenissen opslaan mislukt:', error.message)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}

export function logRecommendationEvent(userId: string, e: RecommendationEvent) {
  const key = [e.event, e.screen, e.mode ?? '', e.media_type, e.tmdb_id, amsterdamDay()].join('|')
  if (sent.has(key)) return
  sent.add(key)
  queue.push({
    user_id: userId,
    event: e.event,
    screen: e.screen,
    mode: e.mode,
    media_type: e.media_type,
    tmdb_id: e.tmdb_id,
    position: e.position ?? null,
    match: typeof e.match === 'number' ? Math.round(e.match) : null,
    upcoming: e.upcoming ?? false,
    connection_id: e.connection_id ?? null,
    days_on_list: e.days_on_list ?? null,
  })
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), FLUSH_DELAY_MS)
}

// Een kaart telt als getoond als hij minstens een seconde voor de helft in beeld is. Geef elke kaart de teruggegeven ref en
// een data-seen-key; onSeen krijgt die sleutel één keer per kaart.
const SEEN_AFTER_MS = 1000

export function useSeenTracker(onSeen: (key: string) => void) {
  const onSeenRef = useRef(onSeen)
  useEffect(() => {
    onSeenRef.current = onSeen
  })
  const observerRef = useRef<IntersectionObserver | null>(null)
  const timersRef = useRef(new Map<Element, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  return useCallback((el: HTMLElement | null) => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement
            const timers = timersRef.current
            if (entry.isIntersecting) {
              if (timers.has(target)) continue
              timers.set(
                target,
                setTimeout(() => {
                  timers.delete(target)
                  observerRef.current?.unobserve(target)
                  const key = target.dataset.seenKey
                  if (key) onSeenRef.current(key)
                }, SEEN_AFTER_MS)
              )
            } else {
              const t = timers.get(target)
              if (t) clearTimeout(t)
              timers.delete(target)
            }
          }
        },
        { threshold: 0.5 }
      )
    }
    const observer = observerRef.current
    observer.observe(el)
    return () => {
      observer.unobserve(el)
      const t = timersRef.current.get(el)
      if (t) clearTimeout(t)
      timersRef.current.delete(el)
    }
  }, [])
}
