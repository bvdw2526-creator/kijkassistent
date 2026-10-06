'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/supabase'
import { PlayIcon } from './Icons'

// Link naar de trailer op YouTube, onder de kijkinfo in een titelpopup. Haalt zelf op of er een trailer is
// (zie app/api/trailer/route.ts) en toont niets zolang die er niet is of de aanvraag mislukt.
export default function TrailerLink({ mediaType, id, size = 'sm' }: { mediaType: 'movie' | 'tv'; id: number; size?: 'sm' | 'base' }) {
  // De sleutel hoort bij een titel: wisselt de popup van titel, dan verdwijnt de oude link vanzelf.
  const [found, setFound] = useState<{ title: string; key: string } | null>(null)
  const titleKey = `${mediaType}-${id}`

  useEffect(() => {
    let cancelled = false
    authFetch(`/api/trailer?type=${mediaType}&id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && typeof data.key === 'string') setFound({ title: `${mediaType}-${id}`, key: data.key })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mediaType, id])

  if (!found || found.title !== titleKey) return null
  return (
    <a
      href={`https://www.youtube.com/watch?v=${found.key}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center font-medium text-[#E8A33D] hover:underline mb-4 touch-manipulation ${size === 'base' ? 'gap-2 text-base' : 'gap-1.5 text-sm'}`}
    >
      <PlayIcon className="w-4 h-4" />
      Bekijk de trailer
    </a>
  )
}
