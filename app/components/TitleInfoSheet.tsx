'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { authFetch } from '@/lib/supabase'
import { btnGhost } from './ui'
import { CloseIcon } from './Icons'

export type TitleInfoItem = {
  id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path?: string | null
}

type Info = {
  overview: string
  voteAverage: number
  genres: string[]
  year: string
  posterPath: string | null
  isBookAdaptation: boolean
  streaming: string[]
}

// Infopopup voor een titel buiten de aanbevelingen (zoekresultaten, favorieten,
// beoordelingen, watchlist). Haalt zelf de details op; `children` is voor pagina-eigen
// acties (bv. favoriet maken of beoordelen).
export default function TitleInfoSheet({
  item,
  onClose,
  children,
}: {
  item: TitleInfoItem
  onClose: () => void
  children?: React.ReactNode
}) {
  const [info, setInfo] = useState<Info | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    authFetch(`/api/title-info?type=${item.media_type}&id=${item.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) setFailed(true)
        else setInfo(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [item.id, item.media_type])

  const poster = info?.posterPath ?? item.poster_path ?? null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#1A2330] border border-[#2A3644] rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#3A4A5C]" />
        </div>

        <div className="p-6">
          <div className="flex gap-4 mb-4">
            {poster ? (
              <div className="relative w-24 aspect-[2/3] rounded-xl flex-shrink-0 shadow-lg overflow-hidden">
                <Image
                  src={`https://image.tmdb.org/t/p/w200${poster}`}
                  alt={item.title}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-24 aspect-[2/3] rounded-xl bg-[#212C3B] flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-xl leading-tight">{item.title}</h2>
              <p className="text-sm text-[#93A3B5] mt-1.5">
                {item.media_type === 'tv' ? 'Serie' : 'Film'}
                {info?.year ? ` · ${info.year}` : ''}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {info && info.voteAverage > 0 && (
                  <span className="rounded-full bg-white/5 text-[#93A3B5] text-xs font-medium px-2.5 py-1">
                    ★ {info.voteAverage.toFixed(1)} TMDB
                  </span>
                )}
                {info?.isBookAdaptation && (
                  <span className="rounded-full bg-[#52A9A0]/12 text-[#52A9A0] text-xs font-medium px-2.5 py-1">
                    Gebaseerd op een boek
                  </span>
                )}
              </div>
            </div>
          </div>

          {!info && !failed && <div className="h-16 rounded-xl bg-[#212C3B] animate-skeleton mb-4" />}
          {failed && <p className="text-sm text-[#93A3B5] mb-4">Kon de details niet laden.</p>}

          {info?.overview && <p className="text-sm text-[#F2EFE9]/90 leading-relaxed mb-4">{info.overview}</p>}

          {info && info.genres.length > 0 && (
            <p className="text-sm text-[#93A3B5] mb-2">{info.genres.join(' · ')}</p>
          )}
          {info && (
            <p className="text-sm text-[#93A3B5] mb-5">
              {info.streaming.length > 0 ? (
                <>
                  Te zien op: <span className="text-[#E8A33D]">{info.streaming.join(', ')}</span>
                </>
              ) : (
                'Niet bij een streamingabonnement te zien in Nederland.'
              )}
            </p>
          )}

          {children}

          <button onClick={onClose} className={`${btnGhost} w-full mt-3`}>
            <CloseIcon className="w-4 h-4" />
            Sluiten
          </button>
        </div>
      </div>
    </div>
  )
}
