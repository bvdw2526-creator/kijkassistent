// Skins: een eigen kleurenpalet (en eventueel een eigen achtergrond en banner) dat je bij Instellingen kiest.
// De kleuren zelf staan in app/globals.css onder :root[data-skin="..."]; hier staat wat de app er verder over moet weten.
// De keuze wordt op het apparaat bewaard (localStorage), niet bij het account: zie lib/useSkin.ts.

export type SkinId = 'standaard' | 'halloween' | 'doomsday' | 'dune' | 'matrix' | 'boekenclub' | 'videotheek'

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
    description: 'Paars en pompoenoranje, met een maan en vleermuizen. In oktober met Halloween-films op Voor jou, op 31 oktober alleen Halloween',
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
  {
    // Voor boekenliefhebbers: een rij boekverfilmingen op je eigen diensten bovenaan Voor jou (zie
    // app/components/BookClubRow.tsx), en boekverfilmingen krijgen extra punten in je advies (zie BOOK_ADAPTATION_BONUS
    // in lib/recommendationEngine.ts).
    id: 'boekenclub',
    label: 'Boekenclub',
    description: 'Een bibliotheek bij avond, met boekverfilmingen bovenaan Voor jou en vaker in je advies',
    swatch: ['#13100D', '#D8B06A', '#86B38F'],
  },
  {
    // Een videotheek uit de jaren 90: op Voor jou staan je aanbevelingen per genre in een eigen gangpad, met een
    // hangend bord en een plank (zie app/components/VideotheekAisles.tsx). De lijst zelf blijft hetzelfde.
    id: 'videotheek',
    label: 'Videotheek',
    description: 'Struin door de gangpaden van een videotheek uit de jaren 90, met je advies per genre in het schap',
    swatch: ['#141A33', '#FFC93C', '#FF5A6E'],
  },
]

// De skin die je aanbevelingen op Voor jou in genre-gangpaden zet.
export const VIDEO_STORE_SKIN: SkinId = 'videotheek'

// De skin die boekverfilmingen voorrang geeft (rij op Voor jou en bonus in de score).
export const BOOK_CLUB_SKIN: SkinId = 'boekenclub'

export const DEFAULT_SKIN: SkinId = 'standaard'
export const SKIN_STORAGE_KEY = 'kijkassistent:skin'
// De skin waarvan je de banner hebt weggeklikt (zie app/components/SkinBanner.tsx).
export const SKIN_BANNER_DISMISSED_KEY = 'kijkassistent:skin-banner-weg'

// Met de Halloween-skin aan staat er in oktober (tot en met 1 november, Nederlandse tijd) een rij Halloween-titels
// op Voor jou: zie lib/halloween.ts en app/components/HalloweenRow.tsx.
export function isHalloweenSeason(now: Date = new Date()): boolean {
  const { month, day } = amsterdamDay(now)
  return month === 10 || (month === 11 && day === 1)
}

// Op Halloween zelf (31 oktober) toont Voor jou met de Halloween-skin alleen nog Halloween-titels, ook uit genres die je
// hebt uitgesloten. De dag erna staat het gewone advies er weer.
export function isHalloweenDay(now: Date = new Date()): boolean {
  const { month, day } = amsterdamDay(now)
  return month === 10 && day === 31
}

function amsterdamDay(now: Date): { month: number; day: number } {
  const [, month, day] = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split('-').map(Number)
  return { month, day }
}

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((s) => s.id === value)
}

// Draait in de pagina vóórdat er iets getekend wordt (zie app/layout.tsx), zodat de app niet eerst kort in de
// standaardkleuren verschijnt. Een onbekende waarde heeft geen stijlen en geeft dus gewoon de standaardkleuren.
// In de iPhone-app volgt de tekst ook de tekstgrootte van de iPhone (Android doet dat vanzelf). We lezen de systeemmaat
// van iOS uit en houden die tussen 16 en 19 pixels: groter breekt de knoppen en tabbladen af. Alles in rem groeit mee.
export const SKIN_INIT_SCRIPT = `try{var s=localStorage.getItem('${SKIN_STORAGE_KEY}');if(s&&s!=='${DEFAULT_SKIN}')document.documentElement.dataset.skin=s}catch(e){}try{if(navigator.userAgent.indexOf('KijkassistentApp/iOS')>-1){var d=document.documentElement;d.dataset.app='ios';d.style.font='-apple-system-body';var f=parseFloat(getComputedStyle(d).fontSize)||16;d.style.font='';d.style.fontSize=Math.min(Math.max(f,16),19)+'px'}}catch(e){}`
