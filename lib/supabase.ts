import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// supabase.auth.getUser() doet bij elke aanroep een netwerk-rondje naar de Auth-server om
// het token te herverifiëren — voor gewone lees/schrijfacties (RLS regelt de eigenlijke
// beveiliging op de database zelf) is dat onnodig traag, zeker als een pagina 'm meerdere
// keren per mount aanroept. getSession() leest de lokaal opgeslagen sessie en is vrijwel instant.
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}