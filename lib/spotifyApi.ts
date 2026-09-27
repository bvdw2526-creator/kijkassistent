// Server-only: praat met Spotify om te bepalen of een film/serie een eigen soundtrackalbum
// heeft. Nooit importeren in een 'use client'-bestand (zie lib/spotify.ts voor de link zelf,
// die wél client-side gebruikt wordt).
//
// Spotify houdt zelf geen "heeft deze film een soundtrack"-vlag bij; we zoeken op albums en
// keuren zelf of het topresultaat er echt een is (titel begint met de filmnaam, en de titel of
// artiest verwijst duidelijk naar een soundtrack). Dat is geen garantie — een film met een
// identieke titel als een ander album, of een ongebruikelijke albumnaam, kan gemist worden —
// maar voorkomt dat we de knop tonen bij een willekeurig, niet-gerelateerd zoekresultaat.

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.access_token) return null
    // Een halve minuut marge, zodat een net-verlopen token niet alsnog wordt gebruikt.
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 30) * 1000 }
    return cachedToken.value
  } catch {
    return null
  }
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accenten weg
    .toLowerCase()
    .replace(/[:\-–—'’&,.!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "various artists" erbij: sommige officiële soundtrackalbums heten simpelweg "<Film>: The Album"
// zonder het woord "soundtrack" erin (bv. Suicide Squad), maar staan wel onder die artiestennaam.
const SOUNDTRACK_HINTS = ['soundtrack', 'motion picture', 'original score', 'various artists']

type SpotifyAlbum = {
  name: string
  artists?: { name: string }[]
}

// Het albumresultaat telt als soundtrack van deze titel als de albumnaam met de filmnaam begint
// én de albumnaam of artiestennaam duidelijk naar een soundtrack verwijst (bv. "Rocky IV" door
// "Original Soundtrack", of "Suicide Squad: The Album" door... nee, dat laatste zou dus mislukken
// — vandaar ook de albumnaam zelf meetellen wanneer die expliciet "soundtrack"/"score" bevat).
function looksLikeSoundtrack(album: SpotifyAlbum, normalizedTitle: string): boolean {
  const albumName = normalize(album.name)
  const titleMatches = albumName === normalizedTitle || albumName.startsWith(`${normalizedTitle} `)
  if (!titleMatches) return false

  const artistText = normalize((album.artists || []).map((a) => a.name).join(' '))
  const combined = `${albumName} ${artistText}`
  return SOUNDTRACK_HINTS.some((hint) => combined.includes(hint))
}

export async function hasSoundtrack(title: string): Promise<boolean> {
  const token = await getAccessToken()
  if (!token) return false

  const normalizedTitle = normalize(title)
  if (!normalizedTitle) return false

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${title} soundtrack`)}&type=album&market=NL&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 * 60 * 24 * 30 } }
    )
    if (!res.ok) return false
    const data = await res.json()
    const albums: SpotifyAlbum[] = data.albums?.items || []
    return albums.some((album) => looksLikeSoundtrack(album, normalizedTitle))
  } catch {
    return false
  }
}
