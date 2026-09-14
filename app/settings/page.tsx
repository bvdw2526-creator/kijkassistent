'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { btnPrimary, input, chip, card } from '../components/ui'
import { SearchIcon, PlusIcon, CheckIcon, TrashIcon, UsersIcon } from '../components/Icons'

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
type PartnerConnection = {
  id: string
  other_email: string
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
  created_at: string
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg">{title}</h2>
      {hint && <p className="text-[#93A3B5] text-sm mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

export default function Settings() {
  const [selected, setSelected] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [favoritePeople, setFavoritePeople] = useState<FavoritePerson[]>([])
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState<PersonResult[]>([])
  const [personSearchLoading, setPersonSearchLoading] = useState(false)

  const [favoriteDirectors, setFavoriteDirectors] = useState<FavoritePerson[]>([])
  const [directorQuery, setDirectorQuery] = useState('')
  const [directorResults, setDirectorResults] = useState<PersonResult[]>([])
  const [directorSearchLoading, setDirectorSearchLoading] = useState(false)

  const [connections, setConnections] = useState<PartnerConnection[]>([])
  const [partnerEmail, setPartnerEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    loadProfile()
    loadFavoritePeople()
    loadFavoriteDirectors()
    loadConnections()
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
    setSaved(false)
    setErrorMessage(null)
    const { error } = await supabase
      .from('profiles')
      .update({ streaming_services: selected, excluded_genres: excludedGenres })
      .eq('id', user.id)
    if (error) {
      console.error('Voorkeuren opslaan mislukt:', error)
      setErrorMessage(
        `Kon niet opslaan: ${error.message}. Is de migratie "excluded_genres" al uitgevoerd in Supabase?`
      )
      return
    }
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
    setErrorMessage(null)
    const { error } = await supabase.from('favorite_people').insert({
      user_id: user.id,
      person_id: person.id,
      name: person.name,
      profile_path: person.profile_path,
    })
    if (error) {
      console.error('Favoriete acteur toevoegen mislukt:', error)
      setErrorMessage(
        `Kon "${person.name}" niet toevoegen: ${error.message}. Is de migratie "favorite_people" al uitgevoerd in Supabase?`
      )
      return
    }
    setFavoritePeople([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoritePeople])
  }

  async function removeFavoritePerson(personId: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setErrorMessage(null)
    const { error } = await supabase
      .from('favorite_people')
      .delete()
      .eq('user_id', user.id)
      .eq('person_id', personId)
    if (error) {
      console.error('Favoriete acteur verwijderen mislukt:', error)
      setErrorMessage(`Kon niet verwijderen: ${error.message}`)
      return
    }
    setFavoritePeople(favoritePeople.filter((p) => p.person_id !== personId))
  }

  async function loadFavoriteDirectors() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('favorite_directors')
      .select('person_id, name, profile_path')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })
    if (data) setFavoriteDirectors(data)
  }

  async function handleDirectorSearch() {
    if (!directorQuery) return
    setDirectorSearchLoading(true)
    const res = await fetch(`/api/search-people?query=${encodeURIComponent(directorQuery)}&type=director`)
    const data = await res.json()
    setDirectorResults(data.results || [])
    setDirectorSearchLoading(false)
  }

  async function addFavoriteDirector(person: PersonResult) {
    if (favoriteDirectors.find((p) => p.person_id === person.id)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setErrorMessage(null)
    const { error } = await supabase.from('favorite_directors').insert({
      user_id: user.id,
      person_id: person.id,
      name: person.name,
      profile_path: person.profile_path,
    })
    if (error) {
      console.error('Favoriete regisseur toevoegen mislukt:', error)
      setErrorMessage(
        `Kon "${person.name}" niet toevoegen: ${error.message}. Is de migratie "favorite_directors" al uitgevoerd in Supabase?`
      )
      return
    }
    setFavoriteDirectors([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoriteDirectors])
  }

  async function removeFavoriteDirector(personId: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setErrorMessage(null)
    const { error } = await supabase
      .from('favorite_directors')
      .delete()
      .eq('user_id', user.id)
      .eq('person_id', personId)
    if (error) {
      console.error('Favoriete regisseur verwijderen mislukt:', error)
      setErrorMessage(`Kon niet verwijderen: ${error.message}`)
      return
    }
    setFavoriteDirectors(favoriteDirectors.filter((p) => p.person_id !== personId))
  }

  async function loadConnections() {
    const { data, error } = await supabase.rpc('list_partner_connections')
    if (error) {
      console.error('Koppelingen ophalen mislukt:', error)
      return
    }
    if (data) setConnections(data)
  }

  async function sendInvite() {
    if (!partnerEmail) return
    setErrorMessage(null)
    setInviteLoading(true)
    const { error } = await supabase.rpc('invite_partner', { partner_email: partnerEmail })
    setInviteLoading(false)
    if (error) {
      console.error('Partner uitnodigen mislukt:', error)
      setErrorMessage(
        error.message.includes('Geen account gevonden')
          ? 'Geen account gevonden met dit e-mailadres.'
          : `Kon niet uitnodigen: ${error.message}. Is de migratie "partner_connections" al uitgevoerd in Supabase?`
      )
      return
    }
    setPartnerEmail('')
    loadConnections()
  }

  async function acceptConnection(id: string) {
    setErrorMessage(null)
    const { error } = await supabase
      .from('partner_connections')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('Uitnodiging accepteren mislukt:', error)
      setErrorMessage(`Kon de uitnodiging niet accepteren: ${error.message}`)
      return
    }
    loadConnections()
  }

  async function removeConnection(id: string) {
    setErrorMessage(null)
    const { error } = await supabase.from('partner_connections').delete().eq('id', id)
    if (error) {
      console.error('Koppeling verwijderen mislukt:', error)
      setErrorMessage(`Kon de koppeling niet verwijderen: ${error.message}`)
      return
    }
    setConnections(connections.filter((c) => c.id !== id))
  }

  if (loading) {
    return (
      <main className="max-w-sm mx-auto px-5 pt-6 pb-28">
        <div className="h-7 w-40 rounded-lg bg-[#1A2330] animate-skeleton mb-8" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="max-w-sm mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">Mijn voorkeuren</h1>
        <p className="text-[#93A3B5] mb-6">Stel in wat je aanbevelingen beter maakt.</p>

        {errorMessage && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {errorMessage}
          </p>
        )}

        <SectionTitle title="Streamingdiensten" hint="Selecteer waar je een abonnement op hebt." />
        <div className="grid grid-cols-2 gap-2 mb-8">
          {AVAILABLE_SERVICES.map((service) => {
            const active = selected.includes(service.id)
            return (
              <button
                key={service.id}
                onClick={() => toggleService(service.id)}
                className={`flex items-center gap-2 text-left rounded-xl border px-4 py-3 transition-all touch-manipulation active:scale-[0.97] ${
                  active ? 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/10' : 'border-[#2A3644] hover:border-[#3d4c60]'
                }`}
              >
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                  active ? 'border-[#E8A33D] bg-[#E8A33D]' : 'border-[#3A4A5C]'
                }`}>
                  {active && <CheckIcon className="w-3 h-3 text-[#171F2B]" />}
                </span>
                <span className="text-sm font-medium">{service.label}</span>
              </button>
            )
          })}
        </div>

        <SectionTitle
          title="Genres uitsluiten"
          hint="Aangevinkte genres worden nooit aanbevolen, ook niet als een favoriet erop lijkt."
        />
        <h3 className="text-sm text-[#93A3B5] mb-2">Films</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {MOVIE_GENRES.map((genre) => (
            <button key={genre.id} onClick={() => toggleGenre(genre.id)} className={chip(excludedGenres.includes(genre.id), 'coral')}>
              {genre.label}
            </button>
          ))}
        </div>
        <h3 className="text-sm text-[#93A3B5] mb-2">Series</h3>
        <div className="flex flex-wrap gap-2 mb-8">
          {TV_GENRES.map((genre) => (
            <button key={genre.id} onClick={() => toggleGenre(genre.id)} className={chip(excludedGenres.includes(genre.id), 'coral')}>
              {genre.label}
            </button>
          ))}
        </div>

        <SectionTitle
          title="Favoriete acteurs & actrices"
          hint="Tellen zwaar mee: films en series met een favoriet erin komen hoger in je aanbevelingen."
        />

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
            <input
              type="text"
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePersonSearch()}
              placeholder="Zoek een acteur of actrice..."
              className={`${input} pl-10`}
            />
          </div>
          <button onClick={handlePersonSearch} disabled={personSearchLoading} className={btnPrimary}>
            Zoeken
          </button>
        </div>

        {personResults.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-6">
            {personResults.map((person) => {
              const added = favoritePeople.some((p) => p.person_id === person.id)
              return (
                <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  {person.profile_path ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${person.profile_path}`}
                      alt={person.name}
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#212C3B] flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                  <button
                    onClick={() => addFavoritePerson(person)}
                    className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                      added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                    }`}
                  >
                    {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                    {added ? 'Toegevoegd' : 'Toevoegen'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <h3 className="text-sm text-[#93A3B5] mb-2">Jouw favorieten ({favoritePeople.length})</h3>
        {favoritePeople.length === 0 && (
          <p className="text-[#93A3B5] text-sm mb-8">Nog geen favoriete acteurs of actrices toegevoegd.</p>
        )}
        {favoritePeople.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-8">
            {favoritePeople.map((person) => (
              <div key={person.person_id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                {person.profile_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w92${person.profile_path}`}
                    alt={person.name}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#212C3B] flex-shrink-0" />
                )}
                <span className="flex-1 text-sm truncate">{person.name}</span>
                <button
                  onClick={() => removeFavoritePerson(person.person_id)}
                  className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1"
                  aria-label="Verwijderen"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <SectionTitle
          title="Favoriete regisseurs"
          hint="Tellen net zo zwaar mee als favoriete acteurs: films en series van een favoriete regisseur komen hoger in je aanbevelingen."
        />

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
            <input
              type="text"
              value={directorQuery}
              onChange={(e) => setDirectorQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDirectorSearch()}
              placeholder="Zoek een regisseur..."
              className={`${input} pl-10`}
            />
          </div>
          <button onClick={handleDirectorSearch} disabled={directorSearchLoading} className={btnPrimary}>
            Zoeken
          </button>
        </div>

        {directorResults.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-6">
            {directorResults.map((person) => {
              const added = favoriteDirectors.some((p) => p.person_id === person.id)
              return (
                <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  {person.profile_path ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${person.profile_path}`}
                      alt={person.name}
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#212C3B] flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                  <button
                    onClick={() => addFavoriteDirector(person)}
                    className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                      added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                    }`}
                  >
                    {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                    {added ? 'Toegevoegd' : 'Toevoegen'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <h3 className="text-sm text-[#93A3B5] mb-2">Jouw favorieten ({favoriteDirectors.length})</h3>
        {favoriteDirectors.length === 0 && (
          <p className="text-[#93A3B5] text-sm mb-8">Nog geen favoriete regisseurs toegevoegd.</p>
        )}
        {favoriteDirectors.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-8">
            {favoriteDirectors.map((person) => (
              <div key={person.person_id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                {person.profile_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w92${person.profile_path}`}
                    alt={person.name}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#212C3B] flex-shrink-0" />
                )}
                <span className="flex-1 text-sm truncate">{person.name}</span>
                <button
                  onClick={() => removeFavoriteDirector(person.person_id)}
                  className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1"
                  aria-label="Verwijderen"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <SectionTitle
          title="Partner koppelen"
          hint="Nodig je partner uit voor de Samen-aanbevelingen. Diegene moet de uitnodiging zelf accepteren voordat jullie smaak wordt gecombineerd."
        />

        <div className="flex gap-2 mb-4">
          <input
            type="email"
            value={partnerEmail}
            onChange={(e) => setPartnerEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
            placeholder="E-mailadres van je partner"
            className={`${input} flex-1`}
          />
          <button onClick={sendInvite} disabled={inviteLoading} className={btnPrimary}>
            Uitnodigen
          </button>
        </div>

        {connections.length === 0 && (
          <p className="text-[#93A3B5] text-sm mb-8 flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-[#5E6D80]" />
            Nog geen koppeling met een partner.
          </p>
        )}
        {connections.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-8">
            {connections.map((c) => (
              <div key={c.id} className={`${card} flex items-center gap-3 flex-wrap px-4 py-3`}>
                <span className="flex-1 text-sm min-w-[160px]">
                  {c.other_email}
                  <span className="block text-xs text-[#5E6D80] mt-0.5">
                    {c.status === 'accepted'
                      ? 'Gekoppeld'
                      : c.direction === 'incoming'
                        ? 'Wil koppelen'
                        : 'Wacht op reactie'}
                  </span>
                </span>
                <div className="flex gap-2">
                  {c.status === 'pending' && c.direction === 'incoming' && (
                    <button
                      onClick={() => acceptConnection(c.id)}
                      className="text-sm font-medium border border-[#52A9A0] text-[#52A9A0] rounded-full px-3.5 py-1.5 hover:bg-[#52A9A0]/10 transition-colors touch-manipulation active:scale-[0.96]"
                    >
                      Accepteren
                    </button>
                  )}
                  <button
                    onClick={() => removeConnection(c.id)}
                    className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1.5"
                    aria-label="Verwijderen"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleSave} className={`${btnPrimary} w-full`}>
          {saved ? <CheckIcon className="w-4 h-4" /> : null}
          {saved ? 'Opgeslagen' : 'Opslaan'}
        </button>
      </main>

      <BottomNav />
    </>
  )
}
