'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import { btnPrimary, btnSecondary, input, card } from './ui'
import PersonInfoSheet, { type PersonInfoItem } from './PersonInfoSheet'
import { SearchIcon, PlusIcon, CheckIcon, TrashIcon } from './Icons'

type Person = { person_id: number; name: string; profile_path: string | null }
type PersonResult = { id: number; name: string; profile_path: string | null }

// Acteurs en regisseurs werken identiek en verschillen alleen in tabel, zoektype en teksten.
const CONFIG = {
  actor: {
    table: 'favorite_people',
    searchSuffix: '',
    hint: 'Tellen zwaar mee: films en series met een favoriet erin komen hoger in je aanbevelingen.',
    placeholder: 'Zoek een acteur of actrice...',
    empty: 'Nog geen favoriete acteurs of actrices toegevoegd.',
    addError: 'Favoriete acteur toevoegen mislukt:',
  },
  director: {
    table: 'favorite_directors',
    searchSuffix: '&type=director',
    hint: 'Tellen net zo zwaar mee als favoriete acteurs: films en series van een favoriete regisseur komen hoger in je aanbevelingen.',
    placeholder: 'Zoek een regisseur...',
    empty: 'Nog geen favoriete regisseurs toegevoegd.',
    addError: 'Favoriete regisseur toevoegen mislukt:',
  },
} as const

function Avatar({ name, path }: { name: string; path: string | null }) {
  return path ? (
    <Image
      src={`https://image.tmdb.org/t/p/w92${path}`}
      alt={name}
      width={36}
      height={36}
      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
    />
  ) : (
    <div className="w-9 h-9 rounded-full bg-[#212C3B] flex-shrink-0" />
  )
}

export default function PeopleFavorites({ kind }: { kind: 'actor' | 'director' }) {
  const config = CONFIG[kind]
  const [favorites, setFavorites] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoPerson, setInfoPerson] = useState<PersonInfoItem | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const user = await getCurrentUser()
      if (!user) return
      const { data } = await supabase
        .from(config.table)
        .select('person_id, name, profile_path')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false })
      if (!cancelled && data) setFavorites(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [config.table])

  async function handleSearch() {
    if (!query) return
    setSearching(true)
    setError(null)
    const res = await authFetch(`/api/search-people?query=${encodeURIComponent(query)}${config.searchSuffix}`)
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Zoeken mislukt')
    setResults(data.results || [])
    setSearching(false)
  }

  async function add(person: PersonResult) {
    if (favorites.find((p) => p.person_id === person.id)) return
    const user = await getCurrentUser()
    if (!user) return
    setError(null)
    const { error: insertError } = await supabase.from(config.table).insert({
      user_id: user.id,
      person_id: person.id,
      name: person.name,
      profile_path: person.profile_path,
    })
    if (insertError) {
      console.error(config.addError, insertError)
      setError(`Kon "${person.name}" niet toevoegen: ${insertError.message}`)
      return
    }
    setFavorites((current) => [{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...current])
  }

  async function remove(personId: number) {
    const user = await getCurrentUser()
    if (!user) return
    setError(null)
    const { error: deleteError } = await supabase
      .from(config.table)
      .delete()
      .eq('user_id', user.id)
      .eq('person_id', personId)
    if (deleteError) {
      console.error('Favoriet verwijderen mislukt:', deleteError)
      setError(`Kon niet verwijderen: ${deleteError.message}`)
      return
    }
    setFavorites((current) => current.filter((p) => p.person_id !== personId))
  }

  return (
    <div>
      <p className="text-[#93A3B5] text-sm mb-4 leading-relaxed">{config.hint}</p>

      {error && (
        <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </p>
      )}

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={config.placeholder}
            className={`${input} pl-10`}
          />
        </div>
        <button onClick={handleSearch} disabled={searching} className={btnPrimary}>
          Zoeken
        </button>
      </div>

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-6">
          {results.map((person) => {
            const added = favorites.some((p) => p.person_id === person.id)
            return (
              <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                <button
                  onClick={() => setInfoPerson({ id: person.id, name: person.name, profile_path: person.profile_path })}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation"
                >
                  <Avatar name={person.name} path={person.profile_path} />
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                </button>
                <button
                  onClick={() => add(person)}
                  className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                    added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                  }`}
                >
                  {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                  Favoriet
                </button>
              </div>
            )
          })}
        </div>
      )}

      <h2 className="font-display text-lg mb-3">Jouw favorieten ({favorites.length})</h2>
      {favorites.length === 0 && <p className="text-[#93A3B5] text-sm">{config.empty}</p>}
      {favorites.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {favorites.map((person) => (
            <div key={person.person_id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
              <button
                onClick={() => setInfoPerson({ id: person.person_id, name: person.name, profile_path: person.profile_path })}
                className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation"
              >
                <Avatar name={person.name} path={person.profile_path} />
                <span className="flex-1 text-sm truncate">{person.name}</span>
              </button>
              <button
                onClick={() => remove(person.person_id)}
                className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1"
                aria-label="Verwijderen"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {infoPerson && (
        <PersonInfoSheet person={infoPerson} onClose={() => setInfoPerson(null)}>
          {favorites.some((p) => p.person_id === infoPerson.id) ? (
            <button
              onClick={async () => {
                await remove(infoPerson.id)
                setInfoPerson(null)
              }}
              className={`${btnSecondary} w-full`}
            >
              <TrashIcon className="w-4 h-4" />
              Uit favorieten halen
            </button>
          ) : (
            <button onClick={() => add({ id: infoPerson.id, name: infoPerson.name, profile_path: infoPerson.profile_path ?? null })} className={`${btnPrimary} w-full`}>
              <PlusIcon className="w-4 h-4" />
              Favoriet
            </button>
          )}
        </PersonInfoSheet>
      )}
    </div>
  )
}
