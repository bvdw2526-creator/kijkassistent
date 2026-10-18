'use client'

import { supabase } from './supabase'
import { setLocaleCookie, type Locale } from './locale'

// Taal kiezen: op dit apparaat (cookie) én, als je bent ingelogd, bij je account (profiles.language), zodat de
// wekelijkse tipsmail dezelfde taal krijgt en een ander apparaat na het inloggen ook in die taal opent.
export async function chooseLocale(locale: Locale) {
  setLocaleCookie(locale)
  await saveLocaleToAccount(locale)
}

export async function saveLocaleToAccount(locale: Locale) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const { error } = await supabase.from('profiles').update({ language: locale }).eq('id', session.user.id)
  if (error) console.error('Taal bij account opslaan mislukt:', error)
}
