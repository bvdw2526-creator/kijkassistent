import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// supabase.auth.getUser() doet bij elke aanroep een netwerk-rondje naar de Auth-server om
// het token te herverifiëren — voor gewone lees/schrijfacties (RLS regelt de eigenlijke
// beveiliging op de database zelf) is dat onnodig traag, zeker als een pagina 'm meerdere
// keren per mount aanroept. getSession() leest de lokaal opgeslagen sessie en is vrijwel instant.
// fetch naar onze eigen API-routes: die eisen een ingelogde gebruiker (en tellen mee voor
// een ratelimiet), dus het toegangstoken gaat altijd mee.
export async function authFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (session) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(input, { ...init, headers })
}

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}