import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { isLocale, localeFromAcceptLanguage, LOCALE_COOKIE } from '@/lib/locale'

// Zonder taal in de URL (geen /en/...): de taal komt uit de cookie, of anders uit de taal van de browser.
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(fromCookie) ? fromCookie : localeFromAcceptLanguage((await headers()).get('accept-language'))
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
