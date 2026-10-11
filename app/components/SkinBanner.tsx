'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { authFetch, supabase } from '@/lib/supabase'
import { COUNTDOWN_TO_PREMIERE, SKIN_BANNER_DISMISSED_KEY, SKINS } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'
import TitleInfoSheet from './TitleInfoSheet'
import { btnPrimary } from './ui'
import { CheckIcon, CloseIcon, PlusIcon } from './Icons'

// Welke skin-banner je hebt weggeklikt; bewaard op het apparaat, net als de skin zelf. Kies je (opnieuw) een skin
// bij Instellingen, dan komt de banner terug: zie setSkin in lib/useSkin.ts.
const DISMISSED_KEY = SKIN_BANNER_DISMISSED_KEY

type Featured = {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string
  // Uitgerekend bij het ophalen: komt de titel nog uit?
  upcoming: boolean
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}

// `from` plus een aantal hele maanden, in UTC. Bestaat de dag niet in die maand (31 oktober + 1 maand), dan de laatste
// dag van die maand.
function addMonthsUtc(from: Date, months: number): Date {
  const result = new Date(from)
  result.setUTCDate(1)
  result.setUTCMonth(from.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(from.getUTCDate(), lastDay))
  return result
}

// Telt af naar een vast moment, in maanden, dagen, uren, minuten en seconden: dezelfde verdeling als de aftelklok van
// de studio (maanden en dagen op de kalender in UTC geteld). Staat los van de banner, zodat alleen dit blokje elke
// seconde opnieuw tekent.
function Countdown({ target, title }: { target: string; title: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const end = new Date(target)
  if (end.getTime() <= now) return null
  const start = new Date(now)
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
  if (addMonthsUtc(start, months).getTime() > end.getTime()) months -= 1
  const secondsLeft = Math.floor((end.getTime() - addMonthsUtc(start, months).getTime()) / 1000)
  const days = Math.floor(secondsLeft / 86400)
  const two = (n: number) => String(n).padStart(2, '0')
  const parts: [string, string][] = [
    [two(months), 'mnd'],
    [two(days), days === 1 ? 'dag' : 'dagen'],
    [two(Math.floor((secondsLeft % 86400) / 3600)), 'uur'],
    [two(Math.floor((secondsLeft % 3600) / 60)), 'min'],
    [two(secondsLeft % 60), 'sec'],
  ]
  return (
    <div
      className="grid grid-cols-5 gap-1.5 px-4 pt-3"
      role="timer"
      aria-label={`Nog ${months} ${months === 1 ? 'maand' : 'maanden'} en ${days} ${days === 1 ? 'dag' : 'dagen'} tot ${title}`}
    >
      {parts.map(([value, label]) => (
        <div key={label} className="rounded-xl border border-line bg-background/60 py-2 text-center">
          <span className="block font-display text-xl leading-none tabular-nums text-accent">{value}</span>
          <span className="block text-[11px] text-muted mt-1">{label}</span>
        </div>
      ))}
    </div>
  )
}

// Banner bovenaan Voor jou met de titel die bij de gekozen skin hoort (zie lib/skins.ts), met het officiële beeld van
// TMDB erachter. Alleen zichtbaar voor wie die skin heeft aangezet; met het kruisje is hij weg tot je van skin wisselt.
export default function SkinBanner({
  userId,
  onAdded,
}: {
  userId: string
  onAdded?: (id: number, mediaType: 'movie' | 'tv') => void
}) {
  const skin = useSkin()
  const banner = SKINS.find((s) => s.id === skin)?.banner
  const [featured, setFeatured] = useState<{ skin: string; data: Featured } | null>(null)
  const [onList, setOnList] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(readDismissed)
  const [showInfo, setShowInfo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!banner) return
    let cancelled = false
    authFetch(`/api/skin-banner?skin=${skin}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error || !data.title) return
        const today = new Date().toLocaleDateString('sv-SE')
        setFeatured({ skin, data: { ...data, upcoming: !!data.releaseDate && data.releaseDate > today } })
      })
      .catch(() => {})
    supabase
      .from('watchlist')
      .select('tmdb_id')
      .eq('user_id', userId)
      .eq('tmdb_id', banner.tmdbId)
      .eq('media_type', banner.mediaType)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setOnList(!!data)
      })
    return () => {
      cancelled = true
    }
  }, [skin, banner, userId])

  // De gegevens horen bij een skin: na het wisselen niet kort de vorige titel tonen.
  const data = featured && featured.skin === skin ? featured.data : null
  if (!banner || !data || dismissed === skin) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, skin)
    } catch {
      // Opslaan lukt niet: de banner is dan alleen weg tot de pagina opnieuw laadt.
    }
    setDismissed(skin)
  }

  async function addToWatchlist() {
    if (!data || busy) return
    setBusy(true)
    setError(null)
    const { error: insertError } = await supabase.from('watchlist').insert({
      user_id: userId,
      tmdb_id: data.id,
      title: data.title,
      poster_path: data.posterPath,
      media_type: data.mediaType,
    })
    setBusy(false)
    // 23505 = stond er al op: dan is het doel al bereikt.
    if (insertError && insertError.code !== '23505') {
      console.error('Op watchlist zetten mislukt:', insertError)
      setError(`Kon niet op de kijklijst zetten: ${insertError.message}`)
      return
    }
    setOnList(true)
    onAdded?.(data.id, data.mediaType)
  }

  // 'premiere' = het begin van de releasedag (Nederlandse tijd op dit apparaat); anders het vaste tijdstip van de skin.
  const countdownTarget =
    banner.countdownTo === COUNTDOWN_TO_PREMIERE ? (data.releaseDate ? `${data.releaseDate}T00:00:00` : null) : banner.countdownTo ?? null
  const kind = data.mediaType === 'tv' ? 'Serie' : 'Film'
  const where = data.mediaType === 'tv' ? '' : ' in de bioscoop'
  const subtitle = data.upcoming ? `${kind} · vanaf ${longDate(data.releaseDate)}${where}` : `${kind} · ${data.releaseDate.slice(0, 4)}`

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface mb-5 animate-fade-in">
        <button onClick={() => setShowInfo(true)} className="block w-full text-left touch-manipulation" aria-label={`Meer over ${data.title}`}>
          <span className="relative block aspect-[16/8] w-full bg-surface-2">
            {data.backdropPath && (
              <Image
                src={`https://image.tmdb.org/t/p/w780${data.backdropPath}`}
                alt=""
                fill
                sizes="(max-width: 576px) 100vw, 576px"
                // Staat bovenaan de pagina: meteen laden, niet wachten tot hij in beeld scrolt.
                loading="eager"
                className="object-cover"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-surface to-transparent" />
          </span>
          <span className="relative block px-4 -mt-5">
            <span className="inline-block rounded-full bg-teal/12 text-teal text-xs font-semibold px-2.5 py-1">
              {data.upcoming ? 'Binnenkort' : 'Uitgelicht'}
            </span>
            <span className="block font-display text-xl leading-tight mt-2">{data.title}</span>
            <span className="block text-sm text-muted mt-1">{subtitle}</span>
          </span>
        </button>
        <button
          onClick={dismiss}
          aria-label="Banner sluiten"
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 text-muted hover:text-foreground transition-colors touch-manipulation"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
        {countdownTarget && <Countdown target={countdownTarget} title={data.title} />}
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-4">
          {onList ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 text-accent text-sm font-medium px-4 py-2.5">
              <CheckIcon className="w-4 h-4" />
              Staat op je kijklijst
            </span>
          ) : (
            <button
              onClick={addToWatchlist}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent text-on-accent text-sm font-semibold px-4 py-2.5 hover:bg-accent-hover active:scale-[0.97] transition-all disabled:opacity-50 touch-manipulation"
            >
              <PlusIcon className="w-4 h-4" />
              Op mijn kijklijst
            </button>
          )}
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center rounded-full border border-line text-sm font-medium px-4 py-2.5 hover:border-line-strong active:scale-[0.97] transition-all touch-manipulation"
          >
            Meer info
          </button>
        </div>
        {error && <p className="text-sm text-coral px-4 pb-4 -mt-1">{error}</p>}
      </section>

      {showInfo && (
        <TitleInfoSheet
          item={{ id: data.id, media_type: data.mediaType, title: data.title, poster_path: data.posterPath }}
          onClose={() => setShowInfo(false)}
        >
          {!onList && (
            <button onClick={() => addToWatchlist().then(() => setShowInfo(false))} disabled={busy} className={`${btnPrimary} w-full mb-3`}>
              <PlusIcon className="w-4 h-4" />
              Op kijklijst
            </button>
          )}
        </TitleInfoSheet>
      )}
    </>
  )
}
