// Talen van de app. De keuze staat in een cookie (zodat ook de server weet welke taal hij moet tonen); zonder keuze
// volgt de app de taal van de telefoon of browser: Nederlands als die Nederlands is, anders Engels.
export const LOCALES = ['nl', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'nl'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale)

// Accept-Language, bv. "nl-NL,nl;q=0.9,en;q=0.8": de eerste taal die we kennen wint. Een taal die we niet hebben
// (Duits, Pools, ...) telt als Engels; zonder header blijft het Nederlands.
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE
  const preferred = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { lang: tag.toLowerCase().split('-')[0], q: q ? parseFloat(q) : 1 }
    })
    .filter((x) => x.lang && x.lang !== '*')
    .sort((a, b) => b.q - a.q)
  if (preferred.length === 0) return DEFAULT_LOCALE
  return preferred[0].lang === 'nl' ? 'nl' : 'en'
}

// Wisselen vanuit de browser: cookie zetten, daarna de pagina opnieuw laten opbouwen (router.refresh()).
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}
