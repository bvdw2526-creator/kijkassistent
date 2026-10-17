// Verbinding met de service role-sleutel, voor wat de server namens een gebruiker doet zonder dat die is ingelogd: de
// wekelijkse tipsmail opbouwen en versturen, en de acties uit die mail (via een ondertekende link, zie lib/mailLinks.ts).
// Deze sleutel gaat om alle regels (RLS) heen: elke aanroep moet dus zelf al vaststaan voor welke gebruiker hij is, en
// mag alleen diens eigen rijen raken. Voor de gedeelde caches: lib/supabaseAdmin.ts.
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function serviceClient(): SupabaseClient {
  if (!client) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY ontbreekt')
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}
