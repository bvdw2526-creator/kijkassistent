'use client'

import { authFetch } from './supabase'
import type { NewTitle } from '@/app/api/new-titles/route'

// Het stipje bij de knop "Nieuw" op Voor jou: zichtbaar zolang er op de pagina Nieuw titels staan die je daar nog niet
// zag. Welke titels je zag, onthoudt dit apparaat (localStorage); bij elk bezoek aan Nieuw wordt dat de huidige lijst.

export type NewTitlesResponse = {
  cinemaNow: NewTitle[]
  cinemaSoon: NewTitle[]
  onServices: NewTitle[]
  hasServices: boolean
}

const SEEN_KEY = 'kijkassistent:nieuwGezien'

const keysOf = (data: NewTitlesResponse) =>
  [...data.cinemaNow, ...data.cinemaSoon, ...data.onServices].map((t) => `${t.media_type}-${t.id}`)

export async function fetchNewTitles(): Promise<NewTitlesResponse | null> {
  try {
    const res = await authFetch('/api/new-titles')
    if (!res.ok) return null
    return (await res.json()) as NewTitlesResponse
  } catch {
    return null
  }
}

export function markNewTitlesSeen(data: NewTitlesResponse) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keysOf(data)))
  } catch {}
}

export function hasUnseenNewTitles(data: NewTitlesResponse): boolean {
  let seen: Set<string>
  try {
    seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[])
  } catch {
    seen = new Set()
  }
  return keysOf(data).some((k) => !seen.has(k))
}
