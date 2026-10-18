'use client'

import { useLocale, useTranslations } from 'next-intl'
import nl from '@/messages/nl.json'
import { KEYWORD_NL } from './keywordLabels'

// De redenen bij een aanbeveling ("basedOn") worden op de server in het Nederlands gemaakt en zo bewaard (ook in
// source_info, voor de metingen). Bij het tonen vertalen we ze hier naar de taal van de app. Titels van films en series
// en namen van mensen blijven zoals ze zijn.

// Nettere Engelse namen voor TMDB-trefwoorden die als thema getoond worden; de rest toont het trefwoord zelf.
const KEYWORD_EN: Record<string, string> = {
  'based on comic': 'comic book adaptations',
  'based on novel or book': 'book adaptations',
  'artificial intelligence (a.i.)': 'artificial intelligence',
  'marvel cinematic universe (mcu)': 'the Marvel universe',
  'hand to hand combat': 'hand-to-hand combat',
  'post-apocalyptic future': 'post-apocalyptic worlds',
  'father daughter relationship': 'father-daughter relationships',
  'new york city': 'New York',
  'manhattan, new york city': 'New York',
  'dying and death': 'death',
  'superhero teamup': 'superhero teams',
  romcom: 'romcoms',
  dark: 'dark atmosphere',
  gritty: 'gritty atmosphere',
  superhero: 'superheroes',
  'serial killer': 'serial killers',
  heist: 'heists',
}

const DUTCH_THEME_TO_KEYWORD = new Map(Object.entries(KEYWORD_NL).map(([keyword, dutch]) => [dutch, keyword]))
// "Actie" -> "g28": genrenamen in de redenen komen uit de Nederlandse TMDB-genrelijst.
const DUTCH_GENRE_TO_KEY = new Map(Object.entries(nl.genres).map(([key, name]) => [name.toLowerCase(), key]))

const FIXED: Record<string, string> = {
  'vergelijkbare verhaallijn': 'similarStory',
  verrassing: 'surprise',
  'nieuw op je diensten': 'newOnServices',
  'verhaal dat bij jullie allebei past': 'storyFitsBoth',
  'wat jullie samen al waardeerden': 'togetherValued',
}

// Een Nederlandse genrenaam (zoals de server hem stuurt, bv. bij de smaakmatch van Samen) in de taal van de app.
export function useGenreLabel(): (name: string) => string {
  const locale = useLocale()
  const tg = useTranslations('genres')
  return (name) => {
    if (locale === 'nl') return name
    const key = DUTCH_GENRE_TO_KEY.get(name.toLowerCase())
    return key ? tg(key) : name
  }
}

export function useReasonLabel(): (label: string) => string {
  const locale = useLocale()
  const t = useTranslations('reasons')
  const tg = useTranslations('genres')
  if (locale === 'nl') return (label) => label

  const genres = (list: string) =>
    list
      .split(', ')
      .map((name) => {
        const key = DUTCH_GENRE_TO_KEY.get(name.toLowerCase())
        return key ? tg(key) : name
      })
      .join(', ')

  return (label) => {
    if (FIXED[label]) return t(FIXED[label])
    let m = label.match(/^regisseur (.+)$/)
    if (m) return t('director', { name: m[1] })
    m = label.match(/^thema (.+)$/)
    if (m) {
      const keyword = DUTCH_THEME_TO_KEYWORD.get(m[1]) ?? m[1]
      return t('theme', { theme: KEYWORD_EN[keyword.toLowerCase()] ?? keyword })
    }
    m = label.match(/^jullie gedeelde voorkeur voor (.+)$/)
    if (m) return t('sharedPreference', { genres: genres(m[1]) })
    m = label.match(/^jouw voorkeur voor (.+)$/)
    if (m) return t('preference', { genres: genres(m[1]) })
    m = label.match(/^Onderdeel van (.+)$/)
    if (m) return t('partOf', { name: m[1] })
    return label
  }
}
