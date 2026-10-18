import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TOP_TYPES, TOP_SERVICES } from '@/lib/topLists'
import LegalLinks from '../components/LegalLinks'
import { card } from '../components/ui'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('top')
  return { title: t('hubTitle'), description: t('hubDescription') }
}

export default async function Top100Hub() {
  const t = await getTranslations('top')
  return (
    <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">
        {t('back')}
      </Link>
      <h1 className="font-display text-3xl mt-4 mb-2">{t('hubHeading')}</h1>
      <p className="text-muted mb-8 laptop:max-w-2xl">
        {t('hubIntro')}
      </p>

      <div className="laptop:grid laptop:grid-cols-2 laptop:gap-x-8">
      {Object.keys(TOP_TYPES).map((typeSlug) => (
        <section key={typeSlug} className="mb-8">
          <h2 className="font-display text-xl mb-3 capitalize">{t(typeSlug)}</h2>
          <div className="flex flex-col gap-2">
            <Link href={`/top-100/${typeSlug}`} className={`${card} px-4 py-3 text-sm font-medium hover:border-line-strong transition-colors`}>
              {t('bestAll', { type: t(typeSlug) })}
            </Link>
            {Object.entries(TOP_SERVICES).map(([serviceSlug, service]) => (
              <Link
                key={serviceSlug}
                href={`/top-100/${typeSlug}/${serviceSlug}`}
                className={`${card} px-4 py-3 text-sm hover:border-line-strong transition-colors`}
              >
                {t('bestOn', { type: t(typeSlug), service: service.label })}
              </Link>
            ))}
          </div>
        </section>
      ))}
      </div>

      <LegalLinks className="mt-12" />
    </main>
  )
}
