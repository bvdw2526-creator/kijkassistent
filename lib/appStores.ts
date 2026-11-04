// Links naar de app in de winkels. De referrer met utm_source/utm_campaign laat in de Play Console (Store-prestaties →
// Acquisitie) zien vanaf welke plek op de site, in de mail of op social mensen installeerden.
export const PLAY_PACKAGE = 'nl.kijkassistent.app'

// Plekken op social: de korte link kijkassistent.nl/app?van=<plek> (zie app/app/route.ts). 'app' = zonder ?van.
export const SOCIAL_PLACES = ['tiktok', 'instagram', 'facebook', 'app'] as const
export type SocialPlace = (typeof SOCIAL_PLACES)[number]

export type AppLinkPlace = 'landing' | 'tip' | 'videotheek' | 'mail' | SocialPlace

const mediumOf = (place: AppLinkPlace) =>
  place === 'mail' ? 'email' : (SOCIAL_PLACES as readonly string[]).includes(place) ? 'social' : 'site'

export function playStoreUrl(place: AppLinkPlace): string {
  const referrer = encodeURIComponent(`utm_source=kijkassistent.nl&utm_medium=${mediumOf(place)}&utm_campaign=${place}`)
  return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}&referrer=${referrer}`
}
