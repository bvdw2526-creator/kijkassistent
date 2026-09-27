// Puur een link naar Spotify's eigen zoekresultaten — geen API-aanroep, dus geen invloed op
// laadtijden en geen Spotify-account nodig om de link te openen (alleen om iets af te spelen).
export function spotifySoundtrackUrl(title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${title} soundtrack`)}`
}
