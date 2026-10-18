'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { authFetch } from '@/lib/supabase'
import { btnGhost, btnSecondary } from './ui'
import { useBackToClose } from './useBackToClose'
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

// Sleutels onder "person" in messages/*.json.
const DEPARTMENT_LABELS: Record<string, 'acting' | 'directing' | 'writing' | 'production'> = {
  Acting: 'acting',
  Directing: 'directing',
  Writing: 'writing',
  Production: 'production',
}

const BIO_PREVIEW_CHARS = 320

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ageOf(birthday: string, deathday: string | null) {
  const end = deathday ? new Date(deathday) : new Date()
  const born = new Date(birthday)
  let age = end.getFullYear() - born.getFullYear()
  const beforeBirthday =
    end.getMonth() < born.getMonth() || (end.getMonth() === born.getMonth() && end.getDate() < born.getDate())
  if (beforeBirthday) age--
  return age
}

// Infopopup voor een acteur of regisseur uit zoekresultaten of favorietenlijsten;
// `children` is voor pagina-eigen acties (bv. favoriet maken). `filmographyHref`: knop naar alle films en series van deze
// persoon (app/persoon/[id]); weggelaten in de wizard, waar je niet halverwege weg moet.
export default function PersonInfoSheet({
  person,
  onClose,
  children,
  filmographyHref,
}: {
  person: PersonInfoItem
  onClose: () => void
  children?: React.ReactNode
  filmographyHref?: string
}) {
  useBackToClose(true, onClose)
  const [info, setInfo] = useState<Info | null>(null)
  const [failed, setFailed] = useState(false)
  const [bioExpanded, setBioExpanded] = useState(false)
  const t = useTranslations('person')
  const tt = useTranslations('title')
  const locale = useLocale()

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
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-control" />
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
              <div className="w-32 aspect-[2/3] rounded-xl bg-surface-2 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-xl leading-tight">{person.name}</h2>
              {info?.department && (
                <p className="text-sm text-muted mt-1.5">{DEPARTMENT_LABELS[info.department] ? t(DEPARTMENT_LABELS[info.department]) : info.department}</p>
              )}
              {info?.birthday && (
                <p className="text-sm text-muted mt-3">
                  {t('born', { date: formatDate(info.birthday, locale) })}
                  <span className="block text-xs text-faint">
                    {t(info.deathday ? 'diedAtAge' : 'age', { age: ageOf(info.birthday, info.deathday) })}
                  </span>
                </p>
              )}
              {info?.deathday && <p className="text-sm text-muted mt-1">{t('died', { date: formatDate(info.deathday, locale) })}</p>}
              {info?.placeOfBirth && <p className="text-xs text-faint mt-1">{info.placeOfBirth}</p>}
            </div>
          </div>

          {!info && !failed && <div className="h-20 rounded-xl bg-surface-2 animate-skeleton mb-4" />}
          {failed && <p className="text-sm text-muted mb-4">{t('loadFailed')}</p>}

          {bio && (
            <div className="mb-4">
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                {bioExpanded || !longBio ? bio : `${bio.slice(0, BIO_PREVIEW_CHARS).trimEnd()}…`}
              </p>
              {longBio && (
                <button
                  onClick={() => setBioExpanded((v) => !v)}
                  className="text-xs text-accent mt-1 touch-manipulation"
                >
                  {bioExpanded ? t('showLess') : t('readMore')}
                </button>
              )}
            </div>
          )}

          {info && info.knownFor.length > 0 && (
            <div className="mb-5">
              <p className="text-sm font-medium mb-2">{t('knownFor')}</p>
              <ul className="flex flex-col gap-1">
                {info.knownFor.map((title) => (
                  <li key={`${title.media_type}-${title.id}`} className="text-sm text-muted">
                    {title.title}
                    <span className="text-xs text-faint">
                      {title.year ? ` · ${title.year}` : ''} · {title.media_type === 'tv' ? tt('series') : tt('film')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filmographyHref && (
            <Link href={filmographyHref} className={`${btnSecondary} w-full mb-2`}>
              {t('allTitles')}
            </Link>
          )}

          {children}

          <button onClick={onClose} className={`${btnGhost} w-full mt-3`}>
            <CloseIcon className="w-4 h-4" />
            {tt('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
