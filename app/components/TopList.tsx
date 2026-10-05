'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase, getCurrentUser } from '@/lib/supabase'
import type { TopItem } from '@/lib/topLists'
import TitleInfoSheet from './TitleInfoSheet'
import { card } from './ui'
import { HeartIcon, OkIcon, DislikeIcon, StarIcon } from './Icons'

type Mark = 'love' | 'ok' | 'dislike' | 'fav'

const markStyle: Record<Mark, { label: string; className: string }> = {
  love: { label: 'Zeker leuk', className: 'text-[#E8A33D]' },
  ok: { label: 'Was oké', className: 'text-[#52A9A0]' },
  dislike: { label: 'Niet voor mij', className: 'text-[#C97064]' },
  fav: { label: 'Favoriet', className: 'text-[#E8A33D]' },
}

function MarkIcon({ mark }: { mark: Mark }) {
  const props = { className: 'w-4 h-4' }
  if (mark === 'love') return <HeartIcon {...props} />
  if (mark === 'ok') return <OkIcon {...props} />
  if (mark === 'dislike') return <DislikeIcon {...props} />
  return <StarIcon {...props} />
}

// De lijst zelf wordt op de server getoond (zodat Google hem leest); ingelogde gebruikers zien er daarbovenop welke
// titels ze al gezien hebben. Gezien = beoordeeld of favoriet.
export default function TopList({ items }: { items: TopItem[] }) {
  const [marks, setMarks] = useState<Map<string, Mark> | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [open, setOpen] = useState<TopItem | null>(null)

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then(async (user) => {
      if (!user) {
        if (!cancelled) setLoggedIn(false)
        return
      }
      const [ratings, favorites] = await Promise.all([
        supabase.from('ratings').select('tmdb_id, media_type, rating').eq('user_id', user.id),
        supabase.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', user.id),
      ])
      if (cancelled) return
      const map = new Map<string, Mark>()
      for (const f of favorites.data || []) map.set(`${f.media_type}-${f.tmdb_id}`, 'fav')
      // Een beoordeling gaat voor een favoriet: die geeft meer informatie.
      for (const r of ratings.data || []) map.set(`${r.media_type}-${r.tmdb_id}`, r.rating as Mark)
      setMarks(map)
      setLoggedIn(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const seen = marks ? items.filter((i) => marks.has(`${i.media_type}-${i.id}`)).length : 0

  return (
    <>
      {loggedIn === true && (
        <div className={`${card} px-4 py-3 mb-5`}>
          <p className="text-sm font-medium">
            Je hebt {seen} van de {items.length} gezien
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-[#2A3644] overflow-hidden">
            <div className="h-full rounded-full bg-[#E8A33D]" style={{ width: `${items.length ? (seen / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {loggedIn === false && (
        <div className={`${card} px-4 py-3 mb-5`}>
          <p className="text-sm">
            Wil je zien welke je al gezien hebt en welke bij jou passen?{' '}
            <Link href="/register" className="text-[#E8A33D] underline underline-offset-2">
              Maak een account
            </Link>{' '}
            of{' '}
            <Link href="/login" className="text-[#E8A33D] underline underline-offset-2">
              log in
            </Link>
            .
          </p>
        </div>
      )}

      <ol className="flex flex-col gap-2">
        {items.map((item, index) => {
          const mark = marks?.get(`${item.media_type}-${item.id}`)
          const row = (
            <>
              <span className="w-8 text-right font-display text-lg text-[#5E6D80] flex-shrink-0">{index + 1}</span>
              <span className="relative w-10 aspect-[2/3] rounded-md overflow-hidden flex-shrink-0 bg-[#212C3B]">
                {item.poster_path && (
                  <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" fill sizes="40px" className="object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium truncate">{item.title}</span>
                <span className="block text-xs text-[#93A3B5] mt-0.5">
                  {item.year} · ★ {item.voteAverage.toFixed(1).replace('.', ',')}
                </span>
              </span>
              {mark && (
                <span className={`flex-shrink-0 ${markStyle[mark].className}`} title={markStyle[mark].label} aria-label={markStyle[mark].label}>
                  <MarkIcon mark={mark} />
                </span>
              )}
            </>
          )
          return (
            <li key={`${item.media_type}-${item.id}`}>
              {loggedIn ? (
                <button onClick={() => setOpen(item)} className={`${card} w-full flex items-center gap-3 px-3 py-2.5 touch-manipulation hover:border-[#3d4c60] transition-colors`}>
                  {row}
                </button>
              ) : (
                <div className={`${card} flex items-center gap-3 px-3 py-2.5`}>{row}</div>
              )}
            </li>
          )
        })}
      </ol>

      {open && <TitleInfoSheet item={{ id: open.id, media_type: open.media_type, title: open.title, poster_path: open.poster_path }} onClose={() => setOpen(null)} />}
    </>
  )
}
