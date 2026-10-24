import { NextRequest, NextResponse } from 'next/server'
import { guardPublicRequest, LIMITS } from '@/lib/apiGuard'
import { SOURCE_IDS } from '@/lib/recommendationEngine'
import { computePublicTip, PUBLIC_TIP_MAX_TITLES, PUBLIC_TIP_MIN_TITLES, type PublicTipInput } from '@/lib/publicTip'
import { localeFromRequest, serverTranslator } from '@/lib/serverI18n'

// De openbare tip (/tip): een paar titels erin, één tip met alternatieven eruit. Zonder account; zie lib/publicTip.ts.
// Slaat niets op over de bezoeker (alleen een gehasht IP-adres voor de ratelimiet).
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const guard = await guardPublicRequest(request, 'public-tip', LIMITS.publicTip)
  if (!guard.ok) return guard.response

  const locale = localeFromRequest(request)
  const tr = serverTranslator(locale, 'publicTip')

  let body: { titles?: unknown; services?: unknown; samen?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: tr('errInvalid') }, { status: 400 })
  }

  const titles: PublicTipInput[] = (Array.isArray(body.titles) ? body.titles : [])
    .map((t) => t as { media_type?: unknown; id?: unknown })
    .filter((t) => (t.media_type === 'movie' || t.media_type === 'tv') && Number.isInteger(t.id) && (t.id as number) > 0)
    .map((t) => ({ media_type: t.media_type as 'movie' | 'tv', id: t.id as number }))
    .filter((t, i, all) => all.findIndex((o) => o.media_type === t.media_type && o.id === t.id) === i)
    .slice(0, PUBLIC_TIP_MAX_TITLES)
  if (titles.length < PUBLIC_TIP_MIN_TITLES) {
    return NextResponse.json({ error: tr('errMinTitles', { min: PUBLIC_TIP_MIN_TITLES }) }, { status: 400 })
  }
  const services = (Array.isArray(body.services) ? body.services : []).filter(
    (s): s is string => typeof s === 'string' && s in SOURCE_IDS
  )

  try {
    const result = await computePublicTip(guard.supabase, titles, services, body.samen === true, locale)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Openbare tip mislukt:', err)
    return NextResponse.json({ error: tr('errFailed') }, { status: 500 })
  }
}
