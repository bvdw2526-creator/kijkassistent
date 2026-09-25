'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import { btnGhost, btnPrimary, chip } from './ui'
import { CheckIcon, PlusIcon } from './Icons'

// Een mogelijke tip uit /api/popular-tip: populair op je streamingdiensten, zonder uitgesloten
// genres en zonder wat je al beoordeeld of op je lijst hebt.
type Candidate = {
  id: number
  title: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  watchOn: string | null
  explanation: string
}

// media_type staat erbij zodat bij het wisselen tussen Films en Series nooit even de tip van het andere
// soort blijft staan (en er geen weetjes voor de verkeerde soort worden opgehaald).
type Tip = {
  media_type: 'movie' | 'tv'
  tmdb_id: number
  title: string
  poster_path: string | null
  explanation: string | null
  watch_on: string | null
}

type LastWeek = { media_type: 'movie' | 'tv'; tmdb_id: number; title: string; poster_path: string | null }
type Rating = 'love' | 'ok' | 'dislike'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// Maandag van de week van de gegeven datum (lokale tijd), als YYYY-MM-DD.
function weekStartOf(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toTip(c: Candidate): Tip {
  return { media_type: c.media_type, tmdb_id: c.id, title: c.title, poster_path: c.poster_path, explanation: c.explanation, watch_on: c.watchOn }
}

// "Film- of serietip van de week": de hele week dezelfde tip (vastgezet in de database), met een
// weetje dat we zeker weten, en de week erna de vraag of je hem gezien hebt.
export default function WeeklyTip({
  mediaType,
  onRemoved,
}: {
  mediaType: 'movie' | 'tv'
  // Laat de startpagina de titel uit de lijsten halen na een beoordeling of watchlist-actie.
  onRemoved: (id: number, mediaType: 'movie' | 'tv') => void
}) {
  const [userId, setUserId] = useState<string | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [facts, setFacts] = useState<string[]>([])
  const [done, setDone] = useState<'watchlist' | null>(null)
  const [lastWeek, setLastWeek] = useState<LastWeek | null>(null)
  const [info, setInfo] = useState<TitleInfoItem | null>(null)
  // De lijst waaruit "Andere tip" kiest; pas opgehaald als hij nodig is (per soort onthouden).
  const poolRef = useRef<Record<string, Candidate[]>>({})
  const skipsRef = useRef(0)
  const weekStart = weekStartOf(new Date())

  async function loadPool(): Promise<Candidate[]> {
    if (poolRef.current[mediaType]?.length) return poolRef.current[mediaType]
    try {
      const res = await authFetch(`/api/popular-tip?type=${mediaType}`)
      const data = await res.json()
      const items: Candidate[] = res.ok && Array.isArray(data.items) ? data.items : []
      // Een lege of mislukte lijst onthouden we niet: dan lukt "Andere tip" de volgende keer nog.
      if (items.length > 0) poolRef.current[mediaType] = items
      return items
    } catch {
      return []
    }
  }

  // Laad (of kies en bewaar) de tip van deze week, en kijk of er een van vorige week openstaat.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await getCurrentUser()
      if (!user || cancelled) return
      setUserId(user.id)

      const { data: stored } = await supabase
        .from('weekly_tips')
        .select('media_type, tmdb_id, title, poster_path, explanation, watch_on')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .eq('media_type', mediaType)
        .maybeSingle()
      if (cancelled) return

      if (stored) {
        setTip(stored as Tip)
      } else {
        const pool = await loadPool()
        if (cancelled) return
        if (pool.length > 0) {
          // Startpunt: week en gebruiker, zodat het elke week een andere is maar per week vast blijft.
          const weekNumber = Math.floor(Date.parse(weekStart) / (7 * 86400000))
          const userSeed = user.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
          const row = toTip(pool[(weekNumber + userSeed) % pool.length])
          setTip(row)
          await supabase.from('weekly_tips').upsert(
            { user_id: user.id, week_start: weekStart, ...row },
            { onConflict: 'user_id,week_start,media_type', ignoreDuplicates: true }
          )
        } else {
          setTip(null)
        }
      }

      // Vorige week: alleen tonen als je hem nog niet hebt beoordeeld en niet "nog niet gezien" koos.
      const previous = weekStartOf(new Date(Date.now() - 7 * 86400000))
      const { data: last } = await supabase
        .from('weekly_tips')
        .select('media_type, tmdb_id, title, poster_path')
        .eq('user_id', user.id)
        .eq('week_start', previous)
        .eq('media_type', mediaType)
        .eq('dismissed', false)
        .maybeSingle()
      if (cancelled) return
      if (last) {
        const { data: rated } = await supabase
          .from('ratings')
          .select('tmdb_id')
          .eq('user_id', user.id)
          .eq('tmdb_id', last.tmdb_id)
          .eq('media_type', mediaType)
          .maybeSingle()
        if (cancelled) return
        setLastWeek(rated ? null : (last as LastWeek))
      } else {
        setLastWeek(null)
      }
    })()
    return () => {
      cancelled = true
    }
    // loadPool leest alleen mediaType; het effect hoeft niet opnieuw bij elke render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, weekStart])

  const shownTip = tip && tip.media_type === mediaType ? tip : null
  const shownLast = lastWeek && lastWeek.media_type === mediaType ? lastWeek : null

  // Weetjes bij de getoonde tip.
  const tipId = shownTip?.tmdb_id
  useEffect(() => {
    if (!tipId) return
    let cancelled = false
    authFetch(`/api/title-facts?type=${mediaType}&id=${tipId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setFacts(Array.isArray(data.facts) ? data.facts : [])
      })
      .catch(() => {
        if (!cancelled) setFacts([])
      })
    return () => {
      cancelled = true
    }
  }, [tipId, mediaType])

  function dropFromPool(id: number) {
    poolRef.current[mediaType] = (poolRef.current[mediaType] ?? []).filter((c) => c.id !== id)
  }

  async function anotherTip() {
    if (!userId) return
    const pool = (await loadPool()).filter((c) => c.id !== shownTip?.tmdb_id)
    if (pool.length === 0) return
    const next = toTip(pool[skipsRef.current % pool.length])
    skipsRef.current += 1
    setTip(next)
    setFacts([])
    setDone(null)
    await supabase
      .from('weekly_tips')
      .upsert({ user_id: userId, week_start: weekStart, ...next }, { onConflict: 'user_id,week_start,media_type' })
  }

  async function addToWatchlist(item: { id: number; title: string; poster_path: string | null }) {
    if (!userId) return
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: userId, tmdb_id: item.id, title: item.title, poster_path: item.poster_path, media_type: mediaType },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true }
    )
    if (error) return
    dropFromPool(item.id)
    onRemoved(item.id, mediaType)
    setDone('watchlist')
  }

  async function rate(item: { id: number; title: string }, rating: Rating) {
    if (!userId) return
    const { error } = await supabase
      .from('ratings')
      .upsert({ user_id: userId, tmdb_id: item.id, title: item.title, rating, media_type: mediaType }, { onConflict: 'user_id,tmdb_id,media_type' })
    if (error) return
    dropFromPool(item.id)
    onRemoved(item.id, mediaType)
  }

  async function rateLastWeek(rating: Rating) {
    if (!shownLast) return
    await rate({ id: shownLast.tmdb_id, title: shownLast.title }, rating)
    setLastWeek(null)
  }

  async function dismissLastWeek() {
    if (!shownLast || !userId) return
    const previous = weekStartOf(new Date(Date.now() - 7 * 86400000))
    setLastWeek(null)
    await supabase
      .from('weekly_tips')
      .update({ dismissed: true })
      .eq('user_id', userId)
      .eq('week_start', previous)
      .eq('media_type', mediaType)
  }

  if (!shownTip && !shownLast) return null

  return (
    <div className="mb-5 flex flex-col gap-3">
      {shownTip && (
        <div className="rounded-2xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 p-4">
          <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-3">
            {mediaType === 'movie' ? 'Filmtip' : 'Serietip'} van de week
          </p>
          <button
            onClick={() => setInfo({ id: shownTip.tmdb_id, title: shownTip.title, media_type: mediaType, poster_path: shownTip.poster_path })}
            className="flex gap-4 w-full text-left touch-manipulation"
          >
            {shownTip.poster_path ? (
              <div className="relative w-24 aspect-[2/3] rounded-xl flex-shrink-0 overflow-hidden shadow-lg">
                <Image src={`https://image.tmdb.org/t/p/w342${shownTip.poster_path}`} alt={shownTip.title} fill sizes="96px" className="object-cover" />
              </div>
            ) : (
              <div className="w-24 aspect-[2/3] rounded-xl bg-[#212C3B] flex-shrink-0" />
            )}
            <span className="min-w-0">
              <span className="block font-display text-xl leading-tight">{shownTip.title}</span>
              <span className="block text-sm text-[#93A3B5] mt-1">
                {mediaType === 'tv' ? 'Serie' : 'Film'}
                {shownTip.watch_on ? ` · ${shownTip.watch_on}` : ''}
              </span>
              {shownTip.explanation && <span className="block text-sm text-[#F2EFE9]/85 mt-2 leading-relaxed">{shownTip.explanation}</span>}
            </span>
          </button>

          {facts.length > 0 && (
            <div className="mt-3 rounded-xl bg-[#10151C]/60 px-3.5 py-2.5 text-sm leading-relaxed">
              <p className="text-[11px] tracking-[0.15em] uppercase text-[#E8A33D] mb-1">Weetje</p>
              {facts.map((fact) => (
                <p key={fact} className="text-[#F2EFE9]/85">{fact}</p>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {done === 'watchlist' ? (
              <p className="flex-1 flex items-center gap-1.5 text-sm text-[#52A9A0]">
                <CheckIcon className="w-4 h-4" /> Staat op je watchlist
              </p>
            ) : (
              <button
                onClick={() => addToWatchlist({ id: shownTip.tmdb_id, title: shownTip.title, poster_path: shownTip.poster_path })}
                className={`${btnPrimary} flex-1`}
              >
                <PlusIcon className="w-4 h-4" />
                Op watchlist
              </button>
            )}
            <button onClick={anotherTip} className={btnGhost}>
              Andere tip
            </button>
          </div>
        </div>
      )}

      {shownLast && (
        <div className="rounded-2xl border border-[#2A3644] bg-[#1A2330] p-4">
          <p className="text-sm leading-relaxed">
            Vorige week tipten we <span className="font-medium">{shownLast.title}</span>. Al gezien?
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <button onClick={() => rateLastWeek('love')} className={chip(false, 'accent', 'sm')}>Zeker leuk</button>
            <button onClick={() => rateLastWeek('ok')} className={chip(false, 'teal', 'sm')}>Was oké</button>
            <button onClick={() => rateLastWeek('dislike')} className={chip(false, 'coral', 'sm')}>Niet voor mij</button>
            <button onClick={dismissLastWeek} className="text-xs text-[#93A3B5] px-2.5 py-1">Nog niet gezien</button>
          </div>
        </div>
      )}

      {info && (
        <TitleInfoSheet item={info} onClose={() => setInfo(null)}>
          {(details) => (
            <>
              <button
                onClick={() => addToWatchlist({ id: info.id, title: info.title, poster_path: details?.posterPath ?? info.poster_path ?? null })}
                className={`${btnPrimary} w-full mb-3`}
              >
                <PlusIcon className="w-4 h-4" />
                Op watchlist
              </button>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => rate(info, 'love').then(() => setInfo(null))} className={chip(false, 'accent', 'sm')}>Zeker meer zoals dit</button>
                <button onClick={() => rate(info, 'ok').then(() => setInfo(null))} className={chip(false, 'teal', 'sm')}>Was oké</button>
                <button onClick={() => rate(info, 'dislike').then(() => setInfo(null))} className={chip(false, 'coral', 'sm')}>Niet voor mij</button>
              </div>
            </>
          )}
        </TitleInfoSheet>
      )}
    </div>
  )
}
