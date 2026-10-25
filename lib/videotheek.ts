// De gangpaden van de videotheek: in de app met de Videotheek-skin (app/components/VideotheekAisles.tsx) en op de
// openbare pagina /videotheek (app/api/public-videotheek). Op één plek, zodat een titel overal in hetzelfde gangpad staat.
//
// De volgorde is de voorrang: een titel met meerdere genres komt in het eerste gangpad waar een van zijn genres bij
// hoort. Zo staat een horrorkomedie bij Horror en een Pixar-film bij Familie, zoals in een echte videotheek. Drama staat
// achteraan, want dat genre zit bij veel titels. Genres zijn TMDB-genres van films én series (series hebben eigen
// nummers, zoals 10759 voor actie en avontuur). Elk bord heeft een eigen felle kleur, zoals de borden vroeger.
export const AISLES = [
  { id: 'horror', genres: [27], sign: '#3FA34D', ink: '#0B1F0E' },
  { id: 'familie', genres: [10751, 10762], sign: '#FF8FB1', ink: '#3B0A1C' },
  { id: 'tekenfilm', genres: [16], sign: '#FF9F43', ink: '#2E1600' },
  { id: 'scifi', genres: [878, 14, 10765], sign: '#4FD1E8', ink: '#06262C' },
  { id: 'documentaire', genres: [99, 10763, 10764, 10767], sign: '#C9C3B5', ink: '#22201B' },
  { id: 'comedy', genres: [35], sign: '#FFC93C', ink: '#2A1E00' },
  { id: 'actie', genres: [28, 12, 10759], sign: '#E5383B', ink: '#FFF4EC' },
  { id: 'thriller', genres: [53, 80, 9648], sign: '#7B5CD6', ink: '#F4EFFF' },
  { id: 'romantiek', genres: [10749], sign: '#D9467A', ink: '#FFF0F5' },
  { id: 'drama', genres: [18, 36, 10752, 10768, 37, 10402, 10766, 10770], sign: '#2F6FD6', ink: '#EEF4FF' },
] as const

// Voor titels zonder bekend genre.
export const OTHER_AISLE = { id: 'overig', genres: [] as number[], sign: '#8A8FB0', ink: '#14182B' } as const

export type Aisle = (typeof AISLES)[number] | typeof OTHER_AISLE
export type AisleId = Aisle['id']

export function aisleFor(genreIds: number[] | undefined): Aisle {
  const ids = genreIds ?? []
  return AISLES.find((a) => a.genres.some((g) => ids.includes(g))) ?? OTHER_AISLE
}

export function aisleById(id: string): Aisle | undefined {
  return AISLES.find((a) => a.id === id) ?? (id === OTHER_AISLE.id ? OTHER_AISLE : undefined)
}

// TMDB-genres die bij series bestaan; Horror, Thriller en Romantiek zijn er alleen voor films.
export const TV_GENRE_IDS = new Set([10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37])

// Aanmelden vanaf de openbare videotheek: de registratie zet dan de Videotheek-skin aan, toont één keer een welkomstbriefje
// op Voor jou (app/components/VideotheekWelcome.tsx), en bewaart de herkomst bij het account (user_metadata.signup_source),
// zodat het dashboard kan tellen hoeveel aanmeldingen de videotheek oplevert.
export const SIGNUP_SOURCE_VIDEOTHEEK = 'videotheek'
export const REGISTER_FROM_VIDEOTHEEK = `/register?van=${SIGNUP_SOURCE_VIDEOTHEEK}`
export const VIDEOTHEEK_WELCOME_KEY = 'kijkassistent:videotheek-welkom'

// De trechter van de openbare videotheek, per dag geteld (app/api/public-videotheek/count): bezoek, minstens één doosje
// omgedraaid, op "account maken" getikt. Elke stap telt hooguit één keer per browser per dag.
export const VIDEOTHEEK_STEPS = ['bezoek', 'omgedraaid', 'accountklik'] as const
export type VideotheekStep = (typeof VIDEOTHEEK_STEPS)[number]
export const VIDEOTHEEK_COUNTED_KEY = 'kijkassistent:videotheek-geteld'

// De volgorde van de gangpaden op de openbare pagina, zoals je door een winkel loopt: de grote genres vooraan.
// (In de app staat het gangpad met je beste tip vooraan; op de openbare pagina weten we je smaak nog niet.)
export const STORE_ORDER: AisleId[] = ['actie', 'thriller', 'comedy', 'horror', 'scifi', 'drama', 'romantiek', 'familie', 'tekenfilm', 'documentaire']
