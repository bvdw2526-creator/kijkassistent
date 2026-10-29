'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, authFetch } from '@/lib/supabase'
import { appPlatform, listenForPush, registerPushIfAllowed, rememberPushToken, storedPushToken } from '@/lib/native'

// Staat in de layout. In de app (vanaf 4.3.0, met toestemming voor meldingen): meldt bij elke start en na het inloggen
// het adres van de telefoon aan bij de server, en opent bij een tik op een melding de juiste pagina. Op de website en
// in oudere app-versies doet dit niets.
export default function PushSetup() {
  const router = useRouter()

  useEffect(() => {
    const platform = appPlatform()
    if (!platform) return

    listenForPush({
      onToken: async (token) => {
        rememberPushToken(token)
        const { data } = await supabase.auth.getSession()
        if (!data.session) return
        authFetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform }),
        }).catch(() => {})
      },
      onOpen: (url) => router.push(url),
    })

    registerPushIfAllowed()
    // Na inloggen opnieuw aanmelden, zodat het adres bij het juiste account komt.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') registerPushIfAllowed()
    })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eenmalig per pagina-lading
  }, [])

  return null
}

/** Voor het uitloggen: dit toestel krijgt geen meldingen meer voor dit account. */
export async function forgetPushDevice() {
  const token = storedPushToken()
  if (!token) return
  await authFetch('/api/push/register', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => {})
}
