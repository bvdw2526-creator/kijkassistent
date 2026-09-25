'use client'

import { useEffect, useState } from 'react'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { chip } from './ui'

type Item = { tmdb_id: number; media_type: 'movie' | 'tv'; title: string }
type Rating = 'love' | 'ok' | 'dislike'

// Alleen beoordelingen van je partner vanaf de invoering hiervan: eerdere Samen-beoordelingen vragen we niet
// achteraf alsnog na.
const PROMPT_FROM = '2026-09-25T19:00:00Z'
const MAX_ITEMS = 3
const skipKey = (userId: string) => `kijkassistent:partner-rated-skipped:${userId}`

function readSkipped(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(skipKey(userId)) || '[]'))
  } catch {
    return new Set()
  }
}

// Bij Samen beoordeelt ieder persoonlijk: geeft je partner een titel een beoordeling, dan verdwijnt hij
// voor jullie allebei uit Samen. Hier vragen we wat jij er zelf van vond, zodat het ook voor jouw eigen
// smaak meetelt.
export default function PartnerRated({
  connectionId,
  onRated,
}: {
  connectionId: string
  // Laat de startpagina de titel uit de lijsten halen na jouw beoordeling.
  onRated: (id: number, mediaType: 'movie' | 'tv') => void
}) {
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await getCurrentUser()
      if (!user || cancelled) return
      setUserId(user.id)

      const { data: theirs } = await supabase
        .from('couple_ratings')
        .select('tmdb_id, media_type, title, created_at')
        .eq('connection_id', connectionId)
        .neq('rated_by', user.id)
        .gte('created_at', PROMPT_FROM)
        .order('created_at', { ascending: false })
      if (cancelled || !theirs || theirs.length === 0) return

      // Wat je zelf al beoordeeld hebt of als favoriet hebt staan hoeft niet meer gevraagd te worden.
      const ids = theirs.map((t) => t.tmdb_id)
      const [{ data: mine }, { data: favs }] = await Promise.all([
        supabase.from('ratings').select('tmdb_id, media_type').eq('user_id', user.id).in('tmdb_id', ids),
        supabase.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', user.id).in('tmdb_id', ids),
      ])
      if (cancelled) return
      const known = new Set([...(mine ?? []), ...(favs ?? [])].map((r) => `${r.media_type}-${r.tmdb_id}`))
      const skipped = readSkipped(user.id)
      setItems(
        (theirs as Item[])
          .filter((t) => !known.has(`${t.media_type}-${t.tmdb_id}`) && !skipped.has(`${t.media_type}-${t.tmdb_id}`))
          .slice(0, MAX_ITEMS)
      )
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId])

  const dropItem = (item: Item) => setItems((current) => current.filter((i) => !(i.tmdb_id === item.tmdb_id && i.media_type === item.media_type)))

  async function rate(item: Item, rating: Rating) {
    if (!userId) return
    const { error } = await supabase
      .from('ratings')
      .upsert({ user_id: userId, tmdb_id: item.tmdb_id, title: item.title, rating, media_type: item.media_type }, { onConflict: 'user_id,tmdb_id,media_type' })
    if (error) return
    dropItem(item)
    onRated(item.tmdb_id, item.media_type)
  }

  function skip(item: Item) {
    if (!userId) return
    const skipped = readSkipped(userId)
    skipped.add(`${item.media_type}-${item.tmdb_id}`)
    try {
      localStorage.setItem(skipKey(userId), JSON.stringify([...skipped]))
    } catch {
      // geen localStorage: dan komt het vraagje bij een volgend bezoek gewoon terug
    }
    dropItem(item)
  }

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-3 mb-5">
      {items.map((item) => (
        <div key={`${item.media_type}-${item.tmdb_id}`} className="rounded-2xl border border-[#2A3644] bg-[#1A2330] p-4">
          <p className="text-sm leading-relaxed">
            Je partner beoordeelde <span className="font-medium">{item.title}</span>. Wat vond jij er zelf van?
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <button onClick={() => rate(item, 'love')} className={chip(false, 'accent', 'sm')}>Zeker leuk</button>
            <button onClick={() => rate(item, 'ok')} className={chip(false, 'teal', 'sm')}>Was oké</button>
            <button onClick={() => rate(item, 'dislike')} className={chip(false, 'coral', 'sm')}>Niet voor mij</button>
            <button onClick={() => skip(item)} className="text-xs text-[#93A3B5] px-2.5 py-1">Sla over</button>
          </div>
        </div>
      ))}
    </div>
  )
}
