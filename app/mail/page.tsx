'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { btnPrimary, btnSecondary } from '../components/ui'
import { CheckIcon, HeartIcon, OkIcon, DislikeIcon, StarIcon, ClockIcon, BookmarkIcon } from '../components/Icons'
import { TOO_OLD_BEFORE } from '@/lib/tooOld'

type Title = { id: number; mt: 'movie' | 'tv'; title: string; poster: string | null; year: number | null; watchOn: string | null }
type MailLinkInfo = { action: 'beoordeel' | 'kijklijst' | 'afmelden'; title: Title | null }

// Waar de knoppen uit de wekelijkse tipsmail heen gaan (zie app/api/mail-action): beoordelen, op je kijklijst zetten of
// afmelden, zonder in te loggen. Opslaan gebeurt pas na een tik hier, behalve bij afmelden: dat gaat meteen bij openen
// (één klik), met een knop om het terug te draaien.
export default function MailPage() {
  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent mb-4">Kijkassistent</p>
      <Suspense fallback={<div className="h-40 rounded-2xl bg-surface animate-skeleton" />}>
        <MailAction />
      </Suspense>
    </main>
  )
}

async function post(token: string, keuze: string): Promise<string | null> {
  try {
    const res = await fetch('/api/mail-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, keuze }),
    })
    const data = await res.json()
    return res.ok ? null : data.error || 'Er ging iets mis.'
  } catch {
    return 'Er ging iets mis. Controleer je verbinding en probeer het opnieuw.'
  }
}

function MailAction() {
  const token = useSearchParams().get('t') ?? ''
  const [link, setLink] = useState<MailLinkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const unsubscribed = useRef(false)

  useEffect(() => {
    fetch(`/api/mail-action?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setLink(data)
      })
      .catch((err) => setError(err instanceof Error && err.message ? err.message : 'Deze link is verlopen of klopt niet.'))
  }, [token])

  async function choose(keuze: string, message: string) {
    setBusy(true)
    const err = await post(token, keuze)
    setBusy(false)
    if (err) setError(err)
    else {
      setError(null)
      setDone(message)
    }
  }

  // Afmelden: één klik, dus meteen bij openen van de pagina. Gebeurt in de browser (niet op de server bij het openen van de
  // link), zodat een mailprogramma dat links vooraf controleert je niet ongemerkt afmeldt.
  useEffect(() => {
    if (link?.action !== 'afmelden' || unsubscribed.current) return
    unsubscribed.current = true
    choose('afmelden', 'Je bent afgemeld. Je krijgt geen wekelijkse tipsmail meer.')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eenmalig bij openen; choose verandert elke render
  }, [link])

  if (error && !link) return <p className="text-muted leading-relaxed">{error}</p>
  if (!link) return <div className="h-40 rounded-2xl bg-surface animate-skeleton" />

  if (link.action === 'afmelden') {
    const subscribedAgain = done?.startsWith('Je krijgt')
    return (
      <>
        <h1 className="font-display text-2xl mb-3">{subscribedAgain ? 'Weer aangemeld' : 'Afmelden'}</h1>
        {busy && !done && <p className="text-muted">Bezig…</p>}
        {done && <p className="text-muted leading-relaxed mb-6">{done}</p>}
        {error && <p className="text-coral text-sm mb-4">{error}</p>}
        {done && !subscribedAgain && (
          <button
            onClick={() => choose('aanmelden', 'Je krijgt de wekelijkse tipsmail weer.')}
            disabled={busy}
            className={`${btnSecondary} w-full`}
          >
            Toch weer aanmelden
          </button>
        )}
        <p className="text-xs text-faint mt-6">Je kunt dit ook altijd aan- of uitzetten bij Instellingen in de app.</p>
      </>
    )
  }

  const t = link.title
  if (!t) return <p className="text-muted">Deze link klopt niet.</p>
  const isOld = t.year !== null && t.year < TOO_OLD_BEFORE

  return (
    <>
      <div className="flex gap-4 mb-6">
        {t.poster ? (
          <div className="relative w-24 aspect-[2/3] rounded-xl flex-shrink-0 shadow-lg overflow-hidden">
            <Image src={`https://image.tmdb.org/t/p/w200${t.poster}`} alt={t.title} fill sizes="96px" className="object-cover" />
          </div>
        ) : (
          <div className="w-24 aspect-[2/3] rounded-xl bg-surface-2 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl leading-tight">{t.title}</h1>
          <p className="text-sm text-muted mt-1.5">
            {t.mt === 'tv' ? 'Serie' : 'Film'}
            {t.year ? ` · ${t.year}` : ''}
          </p>
          {t.watchOn && <p className="text-sm text-accent mt-1">{t.watchOn}</p>}
        </div>
      </div>

      {done ? (
        <div className="flex flex-col items-start gap-4">
          <p className="flex items-center gap-2 text-teal">
            <CheckIcon className="w-5 h-5" />
            {done}
          </p>
          <Link href="/" className={`${btnSecondary} w-full`}>
            Open Kijkassistent
          </Link>
        </div>
      ) : link.action === 'kijklijst' ? (
        <button onClick={() => choose('ja', 'Op je kijklijst gezet')} disabled={busy} className={`${btnPrimary} w-full`}>
          <BookmarkIcon className="w-4 h-4" />
          Ja, zet op mijn kijklijst
        </button>
      ) : (
        <>
          <p className="text-sm text-muted mb-3">Al gezien? Wat vond je ervan?</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { keuze: 'favoriet', label: 'Favoriet', icon: StarIcon, hover: 'hover:border-accent hover:text-accent' },
              { keuze: 'love', label: 'Zeker leuk', icon: HeartIcon, hover: 'hover:border-accent hover:text-accent' },
              { keuze: 'ok', label: 'Was oké', icon: OkIcon, hover: 'hover:border-teal hover:text-teal' },
              { keuze: 'dislike', label: 'Niet voor mij', icon: DislikeIcon, hover: 'hover:border-coral hover:text-coral' },
              ...(isOld ? [{ keuze: 'te_oud', label: 'Te oud', icon: ClockIcon, hover: 'hover:border-line-strong' }] : []),
            ].map(({ keuze, label, icon: Icon, hover }) => (
              <button
                key={keuze}
                onClick={() => choose(keuze, 'Opgeslagen, bedankt!')}
                disabled={busy}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface py-3.5 text-foreground transition-all active:scale-[0.97] touch-manipulation disabled:opacity-50 ${hover}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p className="text-coral text-sm mt-4">{error}</p>}
    </>
  )
}
