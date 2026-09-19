'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { authFetch } from '@/lib/supabase'
import { btnGhost } from './ui'
import { CloseIcon } from './Icons'

export type PersonInfoItem = { id: number; name: string; profile_path?: string | null }

type Info = {
  name: string
  profilePath: string | null
  department: string
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  biography: string
  knownFor: { id: number; media_type: 'movie' | 'tv'; title: string; year: string }[]
}

const DEPARTMENT_LABELS: Record<string, string> = {
  Acting: 'Acteur of actrice',
  Directing: 'Regisseur',
  Writing: 'Schrijver',
  Production: 'Producent',
}

const BIO_PREVIEW_CHARS = 320

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ageLabel(birthday: string, deathday: string | null) {
  const end = deathday ? new Date(deathday) : new Date()
  const born = new Date(birthday)
  let age = end.getFullYear() - born.getFullYear()
  const beforeBirthday =
    end.getMonth() < born.getMonth() || (end.getMonth() === born.getMonth() && end.getDate() < born.getDate())
  if (beforeBirthday) age--
  return deathday ? `overleden op ${age}-jarige leeftijd` : `${age} jaar`
}

// Infopopup voor een acteur of regisseur uit zoekresultaten of favorietenlijsten;
// `children` is voor pagina-eigen acties (bv. favoriet maken).
export default function PersonInfoSheet({
  person,
  onClose,
  children,
}: {
  person: PersonInfoItem
  onClose: () => void
  children?: React.ReactNode
}) {
  const [info, setInfo] = useState<Info | null>(null)
  const [failed, setFailed] = useState(false)
  const [bioExpanded, setBioExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    authFetch(`/api/person-info?id=${person.id}`)
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
  }, [person.id])

  const photo = info?.profilePath ?? person.profile_path ?? null
  const bio = info?.biography ?? ''
  const longBio = bio.length > BIO_PREVIEW_CHARS

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
            {photo ? (
              <div className="relative w-32 aspect-[2/3] rounded-xl flex-shrink-0 shadow-lg overflow-hidden">
                <Image
                  src={`https://image.tmdb.org/t/p/w342${photo}`}
                  alt={person.name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-32 aspect-[2/3] rounded-xl bg-[#212C3B] flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-xl leading-tight">{person.name}</h2>
              {info?.department && (
                <p className="text-sm text-[#93A3B5] mt-1.5">{DEPARTMENT_LABELS[info.department] ?? info.department}</p>
              )}
              {info?.birthday && (
                <p className="text-sm text-[#93A3B5] mt-3">
                  Geboren {formatDate(info.birthday)}
                  <span className="block text-xs text-[#5E6D80]">{ageLabel(info.birthday, info.deathday)}</span>
                </p>
              )}
              {info?.deathday && <p className="text-sm text-[#93A3B5] mt-1">Overleden {formatDate(info.deathday)}</p>}
              {info?.placeOfBirth && <p className="text-xs text-[#5E6D80] mt-1">{info.placeOfBirth}</p>}
            </div>
          </div>

          {!info && !failed && <div className="h-20 rounded-xl bg-[#212C3B] animate-skeleton mb-4" />}
          {failed && <p className="text-sm text-[#93A3B5] mb-4">Kon de gegevens niet laden.</p>}

          {bio && (
            <div className="mb-4">
              <p className="text-sm text-[#F2EFE9]/90 leading-relaxed whitespace-pre-line">
                {bioExpanded || !longBio ? bio : `${bio.slice(0, BIO_PREVIEW_CHARS).trimEnd()}…`}
              </p>
              {longBio && (
                <button
                  onClick={() => setBioExpanded((v) => !v)}
                  className="text-xs text-[#E8A33D] mt-1 touch-manipulation"
                >
                  {bioExpanded ? 'Minder tonen' : 'Meer lezen'}
                </button>
              )}
            </div>
          )}

          {info && info.knownFor.length > 0 && (
            <div className="mb-5">
              <p className="text-sm font-medium mb-2">Bekend van</p>
              <ul className="flex flex-col gap-1">
                {info.knownFor.map((t) => (
                  <li key={`${t.media_type}-${t.id}`} className="text-sm text-[#93A3B5]">
                    {t.title}
                    <span className="text-xs text-[#5E6D80]">
                      {t.year ? ` · ${t.year}` : ''} · {t.media_type === 'tv' ? 'Serie' : 'Film'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
