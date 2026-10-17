import { NextRequest, NextResponse } from 'next/server'
import { readMailToken, type MailLinkPayload } from '@/lib/mailLinks'
import { serviceClient } from '@/lib/serviceClient'
import { TOO_OLD_REASON } from '@/lib/tooOld'

// Acties uit de wekelijkse tipsmail, zonder in te loggen: de ondertekende link (lib/mailLinks.ts) bepaalt voor wie en
// voor welke titel. GET leest alleen (voor de pagina /mail); er wordt pas iets opgeslagen bij een POST, dus na een tik op
// die pagina. Mailprogramma's openen links vaak al vooraf om ze te controleren, en dat mag niets veranderen.

const RATINGS = new Set(['love', 'ok', 'dislike'])
// Alles wat via de mail binnenkomt krijgt deze herkomst, zodat de raak-meter het apart kan tellen.
const SOURCE_INFO = { mode: 'mail' }

export async function GET(request: NextRequest) {
  const payload = readMailToken(request.nextUrl.searchParams.get('t'))
  if (!payload) return NextResponse.json({ error: 'Deze link is verlopen of klopt niet.' }, { status: 400 })
  return NextResponse.json({ action: payload.a, title: payload.t ?? null })
}

export async function POST(request: NextRequest) {
  // Afmelden met één klik vanuit het mailprogramma zelf (de kop List-Unsubscribe-Post): dan staat de link in de url en
  // komt er een formulier mee in plaats van JSON.
  const isOneClick = (request.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')
  let token: string | null = request.nextUrl.searchParams.get('t')
  let choice = 'afmelden'
  if (!isOneClick) {
    try {
      const body = await request.json()
      token = typeof body.t === 'string' ? body.t : null
      choice = typeof body.keuze === 'string' ? body.keuze : ''
    } catch {
      return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
    }
  }
  const payload = readMailToken(token)
  if (!payload) return NextResponse.json({ error: 'Deze link is verlopen of klopt niet.' }, { status: 400 })
  if (isOneClick && payload.a !== 'afmelden') return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })

  try {
    const error = await perform(payload, choice)
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Actie uit de tipsmail mislukt:', err)
    return NextResponse.json({ error: 'Opslaan mislukt. Probeer het later opnieuw.' }, { status: 500 })
  }
}

// Voert de keuze uit; geeft een foutmelding terug als de keuze niet bij de link past.
async function perform(payload: MailLinkPayload, choice: string): Promise<string | null> {
  const db = serviceClient()
  const userId = payload.u

  if (payload.a === 'afmelden') {
    if (choice !== 'afmelden' && choice !== 'aanmelden') return 'Onbekende keuze'
    const { error } = await db.from('profiles').update({ weekly_mail: choice === 'aanmelden' }).eq('id', userId)
    if (error) throw error
    return null
  }

  const t = payload.t
  if (!t) return 'Geen titel in deze link'
  const base = { user_id: userId, tmdb_id: t.id, media_type: t.mt }

  if (payload.a === 'kijklijst') {
    if (choice !== 'ja') return 'Onbekende keuze'
    const { error } = await db.from('watchlist').insert({
      ...base,
      title: t.title,
      poster_path: t.poster,
      watch_on: t.watchOn,
      watch_url: null,
      source_mode: 'mail',
      source_info: SOURCE_INFO,
    })
    // 23505 = staat er al op: dan is het doel al bereikt.
    if (error && error.code !== '23505') throw error
    return null
  }

  // payload.a === 'beoordeel'
  if (RATINGS.has(choice)) {
    const { error } = await db
      .from('ratings')
      .upsert({ ...base, title: t.title, rating: choice, source_info: SOURCE_INFO }, { onConflict: 'user_id,tmdb_id,media_type' })
    if (error) throw error
    return null
  }
  if (choice === 'favoriet') {
    // favorite_movies heeft geen unieke sleutel per titel: eerst kijken of hij er al staat.
    const { data: existing } = await db.from('favorite_movies').select('id').match(base).limit(1)
    if (existing && existing.length > 0) return null
    const { error } = await db.from('favorite_movies').insert({ ...base, title: t.title, source_info: SOURCE_INFO })
    if (error) throw error
    return null
  }
  if (choice === 'te_oud') {
    const { error } = await db
      .from('hidden_titles')
      .upsert({ ...base, title: t.title, reason: TOO_OLD_REASON, release_year: t.year }, { onConflict: 'user_id,tmdb_id,media_type' })
    if (error) throw error
    return null
  }
  return 'Onbekende keuze'
}
