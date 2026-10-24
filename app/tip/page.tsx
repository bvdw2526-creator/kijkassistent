import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import LegalLinks from '../components/LegalLinks'
import TipForm from './TipForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('publicTip')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

// Openbare pagina: een tip zonder account (zie lib/publicTip.ts en app/api/public-tip).
export default async function TipPage() {
  const common = await getTranslations('common')
  return (
    <main className="max-w-xl laptop:max-w-3xl mx-auto px-5 py-10 leading-relaxed">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="font-display text-sm tracking-[0.2em] uppercase text-accent">
          Kijkassistent
        </Link>
        <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">
          {common('login')}
        </Link>
      </header>
      <TipForm />
      <LegalLinks className="mt-12" />
    </main>
  )
}
