// Puur een link naar Wikipedia's eigen zoekresultaten — zelfde opzet als lib/spotify.ts: geen
// API-aanroep, dus geen invloed op laadtijden. Nederlandse Wikipedia, passend bij de rest van de
// app; heeft die geen artikel, dan toont Wikipedia gewoon een lege zoekpagina (niet kapot).
export function wikipediaSearchUrl(title: string): string {
  return `https://nl.wikipedia.org/w/index.php?search=${encodeURIComponent(title)}`
}
