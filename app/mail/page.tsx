'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
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

// Geeft bij een fout de melding terug; null = gelukt. `fallback` en `offline` zijn de vertaalde standaardmeldingen.
async function post(token: string, keuze: string, fallback: string, offline: string): Promise<string | null> {
  try {
    const res = await fetch('/api/mail-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, keuze }),
    })
    const data = await res.json()
    return res.ok ? null : data.error || fallback
  } catch {
    return offline
  }
}

function MailAction() {
  const token = useSearchParams().get('t') ?? ''
  const [link, setLink] = useState<MailLinkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const unsubscribed = useRef(false)
  const [resubscribed, setResubscribed] = useState(false)
  const t = useTranslations('mailPage')
  const tt = useTranslations('title')
  const ts = useTranslations('stats')

  useEffect(() => {
    fetch(`/api/mail-action?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setLink(data)
      })
      .catch((err) => setError(err instanceof Error && err.message ? err.message : t('expired')))
  }, [token])

  async function choose(keuze: string, message: string) {
    setBusy(true)
    const err = await post(token, keuze, t('error'), t('errorConnection'))
    setBusy(false)
    if (err) setError(err)
    else {
      setError(null)
      setDone(message)
      if (keuze === 'aanmelden') setResubscribed(true)
    }
  }

  // Afmelden: één klik, dus meteen bij openen van de pagina. Gebeurt in de browser (niet op de server bij het openen van de
  // link), zodat een mailprogramma dat links vooraf controleert je niet ongemerkt afmeldt.
  useEffect(() => {
    if (link?.action !== 'afmelden' || unsubscribed.current) return
    unsubscribed.current = true
    choose('afmelden', t('unsubscribed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eenmalig bij openen; choose verandert elke render
  }, [link])

  if (error && !link) return <p className="text-muted leading-relaxed">{error}</p>
  if (!link) return <div className="h-40 rounded-2xl bg-surface animate-skeleton" />

  if (link.action === 'afmelden') {
    const subscribedAgain = resubscribed
    return (
      <>
        <h1 className="font-display text-2xl mb-3">{subscribedAgain ? t('resubscribedTitle') : t('unsubscribeTitle')}</h1>
        {busy && !done && <p className="text-muted">{t('busy')}</p>}
        {done && <p className="text-muted leading-relaxed mb-6">{done}</p>}
        {error && <p className="text-coral text-sm mb-4">{error}</p>}
        {done && !subscribedAgain && (
          <button
            onClick={() => choose('aanmelden', t('resubscribed'))}
            disabled={busy}
            className={`${btnSecondary} w-full`}
          >
            {t('resubscribe')}
          </button>
        )}
        <p className="text-xs text-faint mt-6">{t('settingsNote')}</p>
      </>
    )
  }

  const item = link.title
  if (!item) return <p className="text-muted">{t('invalid')}</p>
  const isOld = item.year !== null && item.year < TOO_OLD_BEFORE

  return (
    <>
      <div className="flex gap-4 mb-6">
        {item.poster ? (
          <div className="relative w-24 aspect-[2/3] rounded-xl flex-shrink-0 shadow-lg overflow-hidden">
            <Image src={`https://image.tmdb.org/t/p/w200${item.poster}`} alt={item.title} fill sizes="96px" className="object-cover" />
          </div>
        ) : (
          <div className="w-24 aspect-[2/3] rounded-xl bg-surface-2 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl leading-tight">{item.title}</h1>
          <p className="text-sm text-muted mt-1.5">
            {item.mt === 'tv' ? tt('series') : tt('film')}
            {item.year ? ` · ${item.year}` : ''}
          </p>
          {item.watchOn && <p className="text-sm text-accent mt-1">{item.watchOn}</p>}
        </div>
      </div>

      {done ? (
        <div className="flex flex-col items-start gap-4">
          <p className="flex items-center gap-2 text-teal">
            <CheckIcon className="w-5 h-5" />
            {done}
          </p>
          <Link href="/" className={`${btnSecondary} w-full`}>
            {t('open')}
          </Link>
        </div>
      ) : link.action === 'kijklijst' ? (
        <button onClick={() => choose('ja', t('addedToWatchlist'))} disabled={busy} className={`${btnPrimary} w-full`}>
          <BookmarkIcon className="w-4 h-4" />
          {t('addYes')}
        </button>
      ) : (
        <>
          <p className="text-sm text-muted mb-3">{t('seenIt')}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { keuze: 'favoriet', label: ts('catFav'), icon: StarIcon, hover: 'hover:border-accent hover:text-accent' },
              { keuze: 'love', label: ts('catLove'), icon: HeartIcon, hover: 'hover:border-accent hover:text-accent' },
              { keuze: 'ok', label: ts('catOk'), icon: OkIcon, hover: 'hover:border-teal hover:text-teal' },
              { keuze: 'dislike', label: ts('catDislike'), icon: DislikeIcon, hover: 'hover:border-coral hover:text-coral' },
              ...(isOld ? [{ keuze: 'te_oud', label: tt('tooOld'), icon: ClockIcon, hover: 'hover:border-line-strong' }] : []),
            ].map(({ keuze, label, icon: Icon, hover }) => (
              <button
                key={keuze}
                onClick={() => choose(keuze, t('saved'))}
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
