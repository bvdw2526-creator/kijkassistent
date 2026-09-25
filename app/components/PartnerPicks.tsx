'use client'

import { useEffect, useState } from 'react'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import { btnPrimary, btnSecondary, card } from './ui'
import { PlusIcon, ChevronLeftIcon } from './Icons'

type Pick = {
  id: number
  media_type: 'movie' | 'tv'
  title: string
  why: 'favoriet' | 'zeker'
  at: string
}

const MAX_PICKS = 5

const normalizeTitle = (title: string) => title.trim().toLowerCase()

// Titels die je partner als favoriet of "zeker leuk" heeft gemarkeerd en die jij nog niet kent
// (niet gekozen, beoordeeld, op een watchlist of samen beoordeeld). Dit is geen berekening: de
// smaak van je partner is voor jou leesbaar via de koppeling.
export default function PartnerPicks({ mediaType }: { mediaType: 'movie' | 'tv' }) {
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [info, setInfo] = useState<TitleInfoItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [years, setYears] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const user = await getCurrentUser()
      if (!user) return
      const { data: conns } = await supabase
        .from('partner_connections')
        .select('id, requester_id, partner_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
        .limit(1)
      const conn = conns?.[0]
      if (!conn) return
      const partnerId = conn.requester_id === user.id ? conn.partner_id : conn.requester_id

      // Overal filteren op user_id: dankzij de partner-leesrechten geven deze tabellen anders
      // ieders rijen door elkaar terug.
      const [pFavs, pLoves, myFavs, myRatings, myWatch, sharedWatch, coupleRatings, myProfile] = await Promise.all([
        supabase.from('favorite_movies').select('tmdb_id, title, media_type, added_at').eq('user_id', partnerId),
        supabase.from('ratings').select('tmdb_id, title, media_type, rated_at').eq('user_id', partnerId).eq('rating', 'love'),
        supabase.from('favorite_movies').select('tmdb_id, media_type, title').eq('user_id', user.id),
        supabase.from('ratings').select('tmdb_id, media_type, title').eq('user_id', user.id),
        supabase.from('watchlist').select('tmdb_id, media_type, title').eq('user_id', user.id),
        supabase.from('couple_watchlist').select('tmdb_id, media_type, title').eq('connection_id', conn.id),
        supabase.from('couple_ratings').select('tmdb_id, media_type, title').eq('connection_id', conn.id),
        supabase.from('profiles').select('excluded_genres').eq('id', user.id).single(),
      ])

      const knownRows = [myFavs.data, myRatings.data, myWatch.data, sharedWatch.data, coupleRatings.data].flatMap(
        (rows) => rows || []
      )
      const known = new Set(knownRows.map((r) => `${r.media_type}-${r.tmdb_id}`))
      // Ook dezelfde titel als film of serie telt als "al gekend": TMDB heeft bv. zowel een film als
      // een serie "De Eetclub", en wie de ene kent hoeft de andere niet voorgesteld te krijgen.
      const knownNames = new Set(knownRows.map((r) => normalizeTitle(r.title as string)))
      const found = new Map<string, Pick>()
      for (const f of pFavs.data || []) {
        found.set(`${f.media_type}-${f.tmdb_id}`, { id: f.tmdb_id, media_type: f.media_type, title: f.title, why: 'favoriet', at: String(f.added_at) })
      }
      for (const r of pLoves.data || []) {
        const key = `${r.media_type}-${r.tmdb_id}`
        if (!found.has(key)) found.set(key, { id: r.tmdb_id, media_type: r.media_type, title: r.title, why: 'zeker', at: String(r.rated_at) })
      }
      const list = Array.from(found.entries())
        .filter(([key, pick]) => !known.has(key) && !knownNames.has(normalizeTitle(pick.title)))
        .map(([, pick]) => pick)
        // Favorieten eerst (die wegen het zwaarst), daarbinnen de nieuwste.
        .sort((a, b) => (a.why === b.why ? b.at.localeCompare(a.at) : a.why === 'favoriet' ? -1 : 1))

      // Titels in een genre dat jij uitsluit niet voorstellen: de rest van de app doet dat ook niet.
      const excluded = new Set<number>((myProfile.data?.excluded_genres as number[] | null) ?? [])
      let allowed = list
      if (excluded.size > 0 && list.length > 0) {
        const genreRows = await Promise.all(
          (['movie', 'tv'] as const).map(async (type) => {
            const ids = list.filter((p) => p.media_type === type).map((p) => p.id)
            if (ids.length === 0) return []
            const { data } = await supabase.from('tmdb_details_cache').select('tmdb_id, genres').eq('media_type', type).in('tmdb_id', ids)
            return (data || []).map((row) => ({ key: `${type}-${row.tmdb_id}`, genres: row.genres as { id: number }[] }))
          })
        )
        const genresByKey = new Map(genreRows.flat().map((r) => [r.key, r.genres]))
        // Zonder bekende genres houden we de titel liever dan hem onterecht weg te laten.
        allowed = list.filter((p) => !(genresByKey.get(`${p.media_type}-${p.id}`) ?? []).some((g) => excluded.has(g.id)))
      }

      if (cancelled) return
      setUserId(user.id)
      setConnectionId(conn.id)
      setPicks(allowed)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = picks.filter((p) => p.media_type === mediaType).slice(0, MAX_PICKS)
  if (!connectionId || visible.length === 0) return null

  // Het jaartal komt uit de titelinfo en wordt pas opgehaald zodra de lijst opengaat.
  function loadYears(list: Pick[]) {
    for (const pick of list) {
      const key = `${pick.media_type}-${pick.id}`
      if (years[key] !== undefined) continue
      authFetch(`/api/title-info?type=${pick.media_type}&id=${pick.id}`)
        .then((res) => res.json())
        .then((data) => setYears((current) => ({ ...current, [key]: data.year || '' })))
        .catch(() => {})
    }
  }

  function toggleOpen() {
    if (!open) loadYears(visible)
    setOpen((o) => !o)
  }

  function removePick(item: TitleInfoItem) {
    setPicks((current) => current.filter((p) => !(p.id === item.id && p.media_type === item.media_type)))
    setInfo(null)
  }

  async function addToShared(item: TitleInfoItem, watchOn: string | null) {
    setError(null)
    const { error: insertError } = await supabase.from('couple_watchlist').insert({
      connection_id: connectionId,
      tmdb_id: item.id,
      media_type: item.media_type,
      title: item.title,
      poster_path: item.poster_path ?? null,
      watch_on: watchOn,
      added_by: userId,
    })
    if (insertError && insertError.code !== '23505') {
      setError(`Kon niet op jullie lijst zetten: ${insertError.message}`)
      return
    }
    removePick(item)
  }

  async function addToMine(item: TitleInfoItem, watchOn: string | null) {
    setError(null)
    const { error: insertError } = await supabase.from('watchlist').insert({
      user_id: userId,
      tmdb_id: item.id,
      title: item.title,
      poster_path: item.poster_path ?? null,
      media_type: item.media_type,
      watch_on: watchOn,
      source_mode: 'samen',
    })
    if (insertError) {
      setError(`Kon niet op je kijklijst zetten: ${insertError.message}`)
      return
    }
    removePick(item)
  }

  return (
    <div className={`${card} mb-5`}>
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left touch-manipulation"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">Dit vindt je partner leuk om te kijken ({visible.length})</span>
          <span className="block text-xs text-[#5E6D80] mt-0.5">Titels die je partner geweldig vindt en jij nog niet kent.</span>
        </span>
        <ChevronLeftIcon className={`w-4 h-4 flex-shrink-0 text-[#93A3B5] transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="px-4 pb-3">
          {error && <p className="text-sm text-[#C97064] mb-2">{error}</p>}
          <ul className="flex flex-col divide-y divide-[#2A3644] border-t border-[#2A3644]">
            {visible.map((pick) => (
              <li key={`${pick.media_type}-${pick.id}`}>
                <button
                  onClick={() => setInfo({ id: pick.id, media_type: pick.media_type, title: pick.title })}
                  className="flex w-full items-center gap-3 py-2.5 text-left touch-manipulation"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{pick.title}</span>
                    <span className="block text-xs text-[#5E6D80]">
                      {pick.media_type === 'tv' ? 'Serie' : 'Film'}
                      {years[`${pick.media_type}-${pick.id}`] ? ` · ${years[`${pick.media_type}-${pick.id}`]}` : ''}
                    </span>
                  </span>
                  <span className="flex-shrink-0 rounded-full bg-[#E8A33D]/12 px-2.5 py-1 text-xs font-medium text-[#E8A33D]">
                    {pick.why === 'favoriet' ? 'Favoriet' : 'Zeker leuk'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {info && (
        <TitleInfoSheet item={info} onClose={() => setInfo(null)}>
          {(details) => {
            const withPoster: TitleInfoItem = { ...info, poster_path: details?.posterPath ?? null }
            const watchOn = details?.streaming[0] ?? null
            return (
              <div className="flex flex-col gap-2">
                <button onClick={() => addToShared(withPoster, watchOn)} disabled={!details} className={btnPrimary}>
                  <PlusIcon className="w-4 h-4" />
                  Op onze lijst
                </button>
                <button onClick={() => addToMine(withPoster, watchOn)} disabled={!details} className={btnSecondary}>
                  Op mijn kijklijst
                </button>
              </div>
            )
          }}
        </TitleInfoSheet>
      )}
    </div>
  )
}
