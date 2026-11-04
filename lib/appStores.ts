// Links naar de app in de winkels. De referrer met utm_source/utm_campaign laat in de Play Console (Store-prestaties →
// Acquisitie) zien vanaf welke plek op de site of in de mail mensen installeerden.
export const PLAY_PACKAGE = 'nl.kijkassistent.app'

export type AppLinkPlace = 'landing' | 'tip' | 'videotheek' | 'mail'

export function playStoreUrl(place: AppLinkPlace): string {
  const referrer = encodeURIComponent(`utm_source=kijkassistent.nl&utm_medium=${place === 'mail' ? 'email' : 'site'}&utm_campaign=${place}`)
  return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}&referrer=${referrer}`
}
