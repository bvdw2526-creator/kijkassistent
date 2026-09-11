'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AVAILABLE_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
]

// TMDB's vaste genre-lijsten (nl-NL). Film- en serie-ids overlappen nooit in
// betekenis (bv. actie is 28 bij films, 10759 bij series), dus ze kunnen allebei in
// dezelfde platte "excluded_genres"-kolom op het profiel worden opgeslagen.
const MOVIE_GENRES = [
  { id: 28, label: 'Actie' },
  { id: 12, label: 'Avontuur' },
  { id: 16, label: 'Animatie' },
  { id: 35, label: 'Komedie' },
  { id: 80, label: 'Misdaad' },
  { id: 99, label: 'Documentaire' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familie' },
  { id: 14, label: 'Fantasy' },
  { id: 36, label: 'Historie' },
  { id: 27, label: 'Horror' },
  { id: 10402, label: 'Muziek' },
  { id: 9648, label: 'Mysterie' },
  { id: 10749, label: 'Romantiek' },
  { id: 878, label: 'Sciencefiction' },
  { id: 10770, label: 'Tv-film' },
  { id: 53, label: 'Thriller' },
  { id: 10752, label: 'Oorlog' },
  { id: 37, label: 'Western' },
]

const TV_GENRES = [
  { id: 10759, label: 'Actie en avontuur' },
  { id: 16, label: 'Animatie' },
  { id: 35, label: 'Komedie' },
  { id: 80, label: 'Misdaad' },
  { id: 99, label: 'Documentaire' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familie' },
  { id: 10762, label: 'Kids' },
  { id: 9648, label: 'Mysterie' },
  { id: 10763, label: 'Nieuws' },
  { id: 10764, label: 'Reality' },
  { id: 10765, label: 'Sciencefiction en fantasy' },
  { id: 10766, label: 'Soap' },
  { id: 10767, label: 'Talkshow' },
  { id: 10768, label: 'Oorlog en politiek' },
  { id: 37, label: 'Western' },
]

type FavoritePerson = { person_id: number; name: string; profile_path: string | null }
type PersonResult = { id: number; name: string; profile_path: string | null }

export default function Settings() {
  const [selected, setSelected] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const [favoritePeople, setFavoritePeople] = useState<FavoritePerson[]>([])
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState<PersonResult[]>([])
  const [personSearchLoading, setPersonSearchLoading] = useState(false)

  useEffect(() => {
    loadProfile()
    loadFavoritePeople()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('streaming_services, excluded_genres')
      .eq('id', user.id)
      .single()
    setSelected(data?.streaming_services || [])
    setExcludedGenres(data?.excluded_genres || [])
    setLoading(false)
  }

  async function loadFavoritePeople() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('favorite_people')
      .select('person_id, name, profile_path')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })
    if (data) setFavoritePeople(data)
  }

  function toggleService(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    )
    setSaved(false)
  }

  function toggleGenre(id: number) {
    setExcludedGenres((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
    )
    setSaved(false)
  }

  async function handleSave() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('profiles')
      .update({ streaming_services: selected, excluded_genres: excludedGenres })
      .eq('id', user.id)
    setSaved(true)
  }

  async function handlePersonSearch() {
    if (!personQuery) return
    setPersonSearchLoading(true)
    const res = await fetch(`/api/search-people?query=${encodeURIComponent(personQuery)}`)
    const data = await res.json()
    setPersonResults(data.results || [])
    setPersonSearchLoading(false)
  }

  async function addFavoritePerson(person: PersonResult) {
    if (favoritePeople.find((p) => p.person_id === person.id)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('favorite_people').insert({
      user_id: user.id,
      person_id: person.id,
      name: person.name,
      profile_path: person.profile_path,
    })
    if (!error) {
      setFavoritePeople([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoritePeople])
    }
  }

  async function removeFavoritePerson(personId: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('favorite_people')
      .delete()
      .eq('user_id', user.id)
      .eq('person_id', personId)
    if (!error) setFavoritePeople(favoritePeople.filter((p) => p.person_id !== personId))
  }

  if (loading) return <p className="p-8 text-[#9FB0C2]">Laden...</p>

  return (
    <main className="max-w-sm mx-auto px-6 py-10">
      <h1 className="font-display text-2xl mb-1">Mijn voorkeuren</h1>
      <p className="text-[#9FB0C2] mb-6">Stel in wat je aanbevelingen beter maakt.</p>

      <h2 className="font-display text-lg mb-2">Streamingdiensten</h2>
      <p className="text-[#9FB0C2] text-sm mb-3">Selecteer waar je een abonnement op hebt.</p>
      <div className="flex flex-col gap-2 mb-8">
        {AVAILABLE_SERVICES.map((service) => {
          const active = selected.includes(service.id)
          return (
            <button
              key={service.id}
              onClick={() => toggleService(service.id)}
              className={`text-left rounded-sm border px-4 py-2.5 transition-colors ${
                active ? 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/10' : 'border-[#3A4A5C] hover:border-[#6B7A8C]'
              }`}
            >
              {service.label}
            </button>
          )
        })}
      </div>

      <h2 className="font-display text-lg mb-2">Genres uitsluiten</h2>
      <p className="text-[#9FB0C2] text-sm mb-3">
        Aangevinkte genres worden nooit aanbevolen, ook niet als een favoriet erop lijkt.
      </p>
      <h3 className="text-sm text-[#9FB0C2] mb-2">Films</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        {MOVIE_GENRES.map((genre) => {
          const active = excludedGenres.includes(genre.id)
          return (
            <button
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`text-sm rounded-sm border px-3 py-1.5 transition-colors ${
                active ? 'border-[#C97064] text-[#C97064] bg-[#C97064]/10' : 'border-[#3A4A5C] hover:border-[#6B7A8C]'
              }`}
            >
              {genre.label}
            </button>
          )
        })}
      </div>
      <h3 className="text-sm text-[#9FB0C2] mb-2">Series</h3>
      <div className="flex flex-wrap gap-2 mb-8">
        {TV_GENRES.map((genre) => {
          const active = excludedGenres.includes(genre.id)
          return (
            <button
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`text-sm rounded-sm border px-3 py-1.5 transition-colors ${
                active ? 'border-[#C97064] text-[#C97064] bg-[#C97064]/10' : 'border-[#3A4A5C] hover:border-[#6B7A8C]'
              }`}
            >
              {genre.label}
            </button>
          )
        })}
      </div>

      <h2 className="font-display text-lg mb-2">Favoriete acteurs &amp; actrices</h2>
      <p className="text-[#9FB0C2] text-sm mb-3">
        Tellen zwaar mee: films en series met een favoriet erin komen hoger in je aanbevelingen.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={personQuery}
          onChange={(e) => setPersonQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePersonSearch()}
          placeholder="Zoek een acteur of actrice..."
          className="flex-1 bg-[#202B3A] border border-[#3A4A5C] rounded-sm px-3 py-2.5 text-[#F2EFE9] placeholder:text-[#6B7A8C] outline-none focus:border-[#E8A33D] transition-colors"
        />
        <button
          onClick={handlePersonSearch}
          disabled={personSearchLoading}
          className="bg-[#E8A33D] text-[#171F2B] font-medium rounded-sm px-5 hover:bg-[#F0B457] transition-colors disabled:opacity-50"
        >
          Zoeken
        </button>
      </div>

      {personResults.length > 0 && (
        <div className="flex flex-col mb-6">
          {personResults.map((person, i) => {
            const added = favoritePeople.some((p) => p.person_id === person.id)
            return (
              <div
                key={person.id}
                className={`flex items-center gap-3 py-2.5 ${i !== personResults.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
              >
                {person.profile_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${person.profile_path}`}
                    alt={person.name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                )}
                <span className="flex-1 text-sm">{person.name}</span>
                <button
                  onClick={() => addFavoritePerson(person)}
                  className={`text-sm rounded-sm px-3 py-1 border transition-colors flex-shrink-0 ${
                    added
                      ? 'border-[#52A9A0] text-[#52A9A0]'
                      : 'border-[#3A4A5C] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                  }`}
                >
                  {added ? 'Toegevoegd' : 'Toevoegen'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <h3 className="text-sm text-[#9FB0C2] mb-2">Jouw favorieten ({favoritePeople.length})</h3>
      {favoritePeople.length === 0 && (
        <p className="text-[#9FB0C2] text-sm mb-8">Nog geen favoriete acteurs of actrices toegevoegd.</p>
      )}
      {favoritePeople.length > 0 && (
        <div className="flex flex-col mb-8">
          {favoritePeople.map((person, i) => (
            <div
              key={person.person_id}
              className={`flex items-center gap-3 py-2.5 ${i !== favoritePeople.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
            >
              {person.profile_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${person.profile_path}`}
                  alt={person.name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              )}
              <span className="flex-1 text-sm">{person.name}</span>
              <button
                onClick={() => removeFavoritePerson(person.person_id)}
                className="text-sm text-[#9FB0C2] hover:text-[#C97064] transition-colors"
              >
                Verwijderen
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSave}
        className="bg-[#E8A33D] text-[#171F2B] font-medium rounded-sm px-5 py-2.5 hover:bg-[#F0B457] transition-colors"
      >
        Opslaan
      </button>
      {saved && <p className="text-[#52A9A0] text-sm mt-2">Opgeslagen</p>}

      <a href="/" className="block mt-6 text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
        Terug naar aanbevelingen
      </a>
    </main>
  )
}
