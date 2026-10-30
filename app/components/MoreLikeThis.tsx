'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { supabase, authFetch } from '@/lib/supabase'
import { watchlistAdded } from '@/lib/watchlistCount'
import { btnSecondary, btnPrimary } from './ui'
import TitleInfoSheet from './TitleInfoSheet'
import { BookmarkIcon, CheckIcon } from './Icons'

type Tip = {
  id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  year: string
  watchOn: string
  watchUrl: string
  similarity: number
}

// Wat deze sessie al is opgehaald: dezelfde popup nog eens openen is dan meteen klaar. Na herladen van de pagina opnieuw,
// zodat net beoordeelde of op de kijklijst gezette titels er weer uit vallen.
const loaded = new Map<string, Tip[]>()

// Knop "Meer zoals deze" in een titel-popup: titels die sterk op deze lijken, alleen op je eigen diensten en nog niet
// door jou gezien (zie app/api/more-like-this). Een tip opent zijn eigen popup, met daarin weer deze knop.
export default function MoreLikeThis({ item }: { item: { id: number; media_type: 'movie' | 'tv'; title: string } }) {
  const cacheKey = `${item.media_type}-${item.id}`
  const [shown, setShown] = useState(false)
  const [tips, setTips] = useState<Tip[] | null>(() => loaded.get(cacheKey) ?? null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<Tip | null>(null)
  const t = useTranslations('moreLikeThis')

  // Al ophalen zodra de popup opent, zodat het rijtje er meestal al staat als je op de knop tikt.
  useEffect(() => {
    if (loaded.has(cacheKey)) return
    let cancelled = false
    authFetch(`/api/more-like-this?type=${item.media_type}&id=${item.id}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error)
        loaded.set(cacheKey, data.items)
        if (!cancelled) setTips(data.items)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, item.media_type, item.id])

  const state = failed ? 'failed' : tips === null ? 'loading' : 'done'

  if (!shown) {
    return (
      <button onClick={() => setShown(true)} className={`${btnSecondary} w-full mb-3`}>
        {t('button')}
      </button>
    )
  }

  return (
    <div className="mb-4">
      <p className="text-sm font-medium mb-2">{t('heading', { title: item.title })}</p>
      {state === 'loading' && (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-24 flex-shrink-0">
              <div className="aspect-[2/3] rounded-xl bg-surface-2 animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            </div>
          ))}
        </div>
      )}
      {state === 'failed' && <p className="text-sm text-muted">{t('failed')}</p>}
      {state === 'done' && tips?.length === 0 && (
        <p className="text-sm text-muted leading-relaxed">
          {t('none')}
        </p>
      )}
      {state === 'done' && tips && tips.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {tips.map((tip) => (
            <button
              key={`${tip.media_type}-${tip.id}`}
              onClick={() => setOpen(tip)}
              className="w-24 flex-shrink-0 text-left snap-start touch-manipulation"
            >
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2">
                {tip.poster_path && (
                  <Image src={`https://image.tmdb.org/t/p/w200${tip.poster_path}`} alt={tip.title} fill sizes="96px" className="object-cover" />
                )}
              </div>
              <p className="text-xs font-medium mt-1.5 leading-tight line-clamp-2">{tip.title}</p>
              <p className="text-[11px] text-faint mt-0.5 truncate">
                {tip.year ? `${tip.year} · ` : ''}{tip.watchOn}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Via een portal, zodat de popup niet binnen de (bewegende) popup eronder wordt geplaatst. */}
      {open &&
        createPortal(
          <TitleInfoSheet item={open} onClose={() => setOpen(null)}>
            <AddToWatchlist tip={open} basedOn={item.title} />
          </TitleInfoSheet>,
          document.body
        )}
    </div>
  )
}

function AddToWatchlist({ tip, basedOn }: { tip: Tip; basedOn: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const t = useTranslations('moreLikeThis')

  async function add() {
    setStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setStatus('failed')
      return
    }
    const { error } = await supabase.from('watchlist').insert({
      user_id: user.id,
      tmdb_id: tip.id,
      title: tip.title,
      poster_path: tip.poster_path,
      media_type: tip.media_type,
      watch_on: tip.watchOn,
      watch_url: tip.watchUrl,
      // Eigen naam, zodat de raak-meter "Meer zoals deze" los kan tellen.
      source_mode: 'meer-zoals',
      source_info: { mode: 'meer-zoals', basedOn: [basedOn], similarity: tip.similarity },
    })
    // 23505 = staat er al op: dan is het doel al bereikt.
    if (!error) watchlistAdded()
    setStatus(error && error.code !== '23505' ? 'failed' : 'saved')
  }

  if (status === 'saved') {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm text-accent mb-3">
        <CheckIcon className="w-4 h-4" />
        {t('added')}
      </p>
    )
  }
  return (
    <>
      <button onClick={add} disabled={status === 'saving'} className={`${btnPrimary} w-full mb-3`}>
        <BookmarkIcon className="w-4 h-4" />
        {t('add')}
      </button>
      {status === 'failed' && <p className="text-sm text-coral mb-3">{t('addFailed')}</p>}
    </>
  )
}
