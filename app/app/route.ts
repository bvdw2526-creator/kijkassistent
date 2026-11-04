import { NextRequest, NextResponse } from 'next/server'
import { playStoreUrl, SOCIAL_PLACES, type SocialPlace } from '@/lib/appStores'

// Korte link voor social en video's: kijkassistent.nl/app (of /app?van=tiktok, ?van=instagram, ?van=facebook).
// - In de eigen app (Android of iPhone; de app opent links naar kijkassistent.nl zelf): naar de startpagina.
// - Android-telefoon: naar de Play Store, met ?van als campagne (zichtbaar in de Play Console onder Acquisitie).
// - Iedereen anders (iPhone, computer): naar de startpagina. Zodra de app in de App Store staat, kan iPhone hier
//   naar de App Store-link.
export function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? ''
  const van = request.nextUrl.searchParams.get('van')?.toLowerCase() ?? 'app'
  const place: SocialPlace = (SOCIAL_PLACES as readonly string[]).includes(van) ? (van as SocialPlace) : 'app'

  const home = new URL('/', request.url)
  const target = ua.includes('KijkassistentApp/') ? home : /Android/i.test(ua) ? playStoreUrl(place) : home

  // 307: tijdelijk, zodat browsers de keuze niet onthouden (later komt er een App Store-link bij).
  const response = NextResponse.redirect(target, 307)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
