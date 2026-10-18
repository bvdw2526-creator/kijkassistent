'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { isLocale, setLocaleCookie } from '@/lib/locale'
import { saveLocaleToAccount } from '@/lib/localeAccount'

// Trekt de taal van het apparaat en die van het account gelijk, één keer per inlog op dit apparaat:
// - heeft het account een taal en wijkt die af, dan schakelt de app daarnaar (bv. Engels gekozen op je telefoon,
//   nu ingelogd op je laptop);
// - heeft het account nog geen taal, dan bewaren we de taal waarin je de app nu gebruikt (voor de tipsmail).
const SYNCED_KEY = 'kijkassistent:taal-gelijkgetrokken'

export default function LocaleSync() {
  const locale = useLocale()
  const router = useRouter()

  useEffect(() => {
    async function sync(userId: string) {
      try {
        if (sessionStorage.getItem(SYNCED_KEY) === userId) return
        sessionStorage.setItem(SYNCED_KEY, userId)
      } catch {
        // Geen sessionStorage: dan gewoon elke keer gelijktrekken.
      }
      const { data } = await supabase.from('profiles').select('language').eq('id', userId).single()
      const saved = data?.language
      if (isLocale(saved)) {
        if (saved !== locale) {
          setLocaleCookie(saved)
          router.refresh()
        }
      } else {
        await saveLocaleToAccount(locale === 'en' ? 'en' : 'nl')
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) sync(session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) sync(session.user.id)
    })
    return () => listener.subscription.unsubscribe()
  }, [locale, router])

  return null
}
