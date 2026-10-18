import type { NextRequest } from 'next/server'
import { createTranslator } from 'next-intl'
import nl from '@/messages/nl.json'
import en from '@/messages/en.json'
import { isLocale, localeFromAcceptLanguage, LOCALE_COOKIE, type Locale } from './locale'

// Voor servercode buiten pagina's (API-routes, mails): dezelfde taalkeuze als in i18n/request.ts, maar dan uit het
// verzoek zelf. fetch vanuit de app stuurt de cookie gewoon mee.
export function localeFromRequest(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(fromCookie) ? fromCookie : localeFromAcceptLanguage(request.headers.get('accept-language'))
}

export type ServerT = (key: string, values?: Record<string, string | number>) => string

// Teksten uit messages/*.json voor één namespace, zonder React.
export function serverTranslator(locale: Locale, namespace: string): ServerT {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : nl, namespace: namespace as never })
  return (key, values) => (t as unknown as ServerT)(key, values)
}

// TMDB-taalcode bij de taal van de app.
export const tmdbLanguage = (locale: Locale) => (locale === 'en' ? 'en-US' : 'nl-NL')
