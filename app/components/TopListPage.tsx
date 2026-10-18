import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { tmdbLanguage } from '@/lib/serverI18n'
import type { Locale } from '@/lib/locale'
import { getTopList, TOP_TYPES, TOP_SERVICES, TOP_SIZE } from '@/lib/topLists'
import { withLatinTitles } from '@/lib/titleFallback'
import TopList from './TopList'
import LegalLinks from './LegalLinks'

// Gedeelde weergave voor alle lijsten onder /top-100 (server component; de lijst wordt een dag hergebruikt).
export default async function TopListPage({ typeSlug, serviceSlug }: { typeSlug: string; serviceSlug: string | null }) {
  const typeInfo = TOP_TYPES[typeSlug]
  const service = serviceSlug ? TOP_SERVICES[serviceSlug] : null
  const raw = await getTopList(typeInfo.type, service ? service.providerId : null, tmdbLanguage((await getLocale()) as Locale))
  const items = await withLatinTitles(raw)

  const t = await getTranslations('top')
  const type = t(typeSlug)
  const heading =
    items.length >= TOP_SIZE
      ? service
        ? t('headingTopOn', { size: TOP_SIZE, type, service: service.label })
        : t('headingTop', { size: TOP_SIZE, type })
      : service
        ? t('headingOn', { type, service: service.label })
        : t('heading', { type })

  return (
    <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/top-100" className="text-sm text-muted hover:text-foreground transition-colors">
        {t('allLists')}
      </Link>
      <h1 className="font-display text-3xl mt-4 mb-2">{heading}</h1>
      <p className="text-muted mb-6 laptop:max-w-2xl">
        {service ? t('introOn', { type, service: service.label }) : t('introAll', { type })}
        {t('method')}
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('failed')}</p>
      ) : (
        <TopList items={items} />
      )}

      <LegalLinks className="mt-12" />
    </main>
  )
}
