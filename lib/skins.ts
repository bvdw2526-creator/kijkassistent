// Skins: een eigen kleurenpalet (en eventueel een eigen achtergrond en banner) dat je bij Instellingen kiest.
// De kleuren zelf staan in app/globals.css onder :root[data-skin="..."]; hier staat wat de app er verder over moet weten.
// De keuze wordt op het apparaat bewaard (localStorage), niet bij het account: zie lib/useSkin.ts.

export type SkinId = 'standaard' | 'halloween' | 'doomsday' | 'dune' | 'matrix'

export type Skin = {
  id: SkinId
  label: string
  description: string
  // Drie kleuren voor het voorbeeldje bij Instellingen: achtergrond, accent en tweede kleur.
  swatch: [string, string, string]
  // Titel die bovenaan Voor jou wordt uitgelicht zolang deze skin aan staat (zie app/components/SkinBanner.tsx).
  // Met countdownTo telt de banner af: 'premiere' = het begin van de dag dat de titel in Nederland uitkomt (volgt
  // TMDB als die datum schuift), of een vast tijdstip in UTC.
  banner?: { mediaType: 'movie' | 'tv'; tmdbId: number; countdownTo?: string }
  // Bewegende achtergrond achter de hele app (zie app/components/SkinBackdrop.tsx).
  effect?: 'coderegen'
}

export const COUNTDOWN_TO_PREMIERE = 'premiere'

export const SKINS: Skin[] = [
  {
    id: 'standaard',
    label: 'Standaard',
    description: 'De vertrouwde kleuren van Kijkassistent',
    swatch: ['#10151C', '#E8A33D', '#52A9A0'],
  },
  {
    id: 'halloween',
    label: 'Halloween',
    description: 'Paars en pompoenoranje, met een maan en vleermuizen. In oktober met Halloween-films bovenaan Voor jou',
    swatch: ['#0D0A12', '#F28C28', '#B18AE8'],
  },
  {
    id: 'doomsday',
    label: 'Doomsday',
    description: 'De klok tikt: tel af naar Doomsday, met de film bovenaan Voor jou',
    swatch: ['#0A0F0C', '#5DBB7A', '#B9C4CB'],
    // Avengers: Doomsday bij TMDB. De teller loopt gelijk met Marvels eigen "Doomsday Clock"
    // (youtube.com/watch?v=f17J3AXVK5w): die telt af naar 18 december 2026, middernacht aan de Amerikaanse oostkust.
    // Gemeten op 11 okt 2026; de livestream zelf loopt ruim een halve minuut achter op dat moment.
    banner: { mediaType: 'movie', tmdbId: 1003596, countdownTo: '2026-12-18T05:00:00Z' },
  },
  {
    id: 'dune',
    label: 'Dune',
    description: 'Zand, zon en zandwormen, en de film bovenaan Voor jou',
    swatch: ['#120D08', '#E08A3C', '#5AA9E6'],
    // Dune: Part Three bij TMDB.
    banner: { mediaType: 'movie', tmdbId: 1170608, countdownTo: COUNTDOWN_TO_PREMIERE },
  },
  {
    id: 'matrix',
    label: 'Matrix',
    description: 'Zwart met fosforgroen en vallende code op de achtergrond',
    swatch: ['#050805', '#3BE06B', '#E0524A'],
    effect: 'coderegen',
  },
]

export const DEFAULT_SKIN: SkinId = 'standaard'
export const SKIN_STORAGE_KEY = 'kijkassistent:skin'
// De skin waarvan je de banner hebt weggeklikt (zie app/components/SkinBanner.tsx).
export const SKIN_BANNER_DISMISSED_KEY = 'kijkassistent:skin-banner-weg'

// Met de Halloween-skin aan staat er in oktober (tot en met 1 november, Nederlandse tijd) een rij Halloween-titels
// op Voor jou: zie lib/halloween.ts en app/components/HalloweenRow.tsx.
export function isHalloweenSeason(now: Date = new Date()): boolean {
  const [, month, day] = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split('-').map(Number)
  return month === 10 || (month === 11 && day === 1)
}

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((s) => s.id === value)
}

// Draait in de pagina vóórdat er iets getekend wordt (zie app/layout.tsx), zodat de app niet eerst kort in de
// standaardkleuren verschijnt. Een onbekende waarde heeft geen stijlen en geeft dus gewoon de standaardkleuren.
export const SKIN_INIT_SCRIPT = `try{var s=localStorage.getItem('${SKIN_STORAGE_KEY}');if(s&&s!=='${DEFAULT_SKIN}')document.documentElement.dataset.skin=s}catch(e){}`
