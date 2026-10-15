// Schrijven naar de gedeelde caches (tmdb_*_cache, title_embeddings, title_embeddings_en). Die gegevens komen van TMDB en
// Voyage en gelden voor iedereen, dus mag alleen de server ze schrijven, niet een gebruiker met zijn eigen sleutel: de
// database kan niet controleren of een rij echt van TMDB of Voyage komt. Daarom met de service role-sleutel, die alleen
// op de server bestaat (Vercel-instelling SUPABASE_SERVICE_ROLE_KEY, lokaal in .env.local; nooit NEXT_PUBLIC_).
//
// Let op: deze sleutel gaat om alle regels (RLS) heen, ook bij gebruikersgegevens. Gebruik hem dus alleen voor het
// schrijven naar de gedeelde caches. Lezen gaat gewoon via de verbinding van de gebruiker.
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let admin: SupabaseClient | null | undefined
let warned = false

// De verbinding om mee naar de gedeelde caches te schrijven. Ontbreekt de sleutel, dan de meegegeven verbinding van de
// gebruiker, zoals vóór 15 okt 2026 (met een waarschuwing in het log). Zodra het schrijven voor gebruikers is dichtgezet,
// mislukt dat schrijven dan: de app werkt door, maar de caches worden niet meer aangevuld.
export function cacheWriter(userClient: SupabaseClient): SupabaseClient {
  if (admin === undefined) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    admin = key
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null
  }
  if (admin) return admin
  if (!warned) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY ontbreekt: de gedeelde caches worden met de sleutel van de gebruiker geschreven.')
    warned = true
  }
  return userClient
}
