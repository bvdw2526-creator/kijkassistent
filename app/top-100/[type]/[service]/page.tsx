import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TOP_TYPES, TOP_SERVICES } from '@/lib/topLists'
import TopListPage from '../../../components/TopListPage'

// De lijst wordt een dag hergebruikt en daarna op de achtergrond vernieuwd.
export const revalidate = 86400

type Params = { params: Promise<{ type: string; service: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { type, service } = await params
  const provider = TOP_SERVICES[service]
  if (!TOP_TYPES[type] || !provider) return {}
  const t = await getTranslations('top')
  return {
    title: t('headingOn', { type: t(type), service: provider.label }),
    description: t('metaServiceDescription', { type: t(type), service: provider.label }),
  }
}

export default async function Page({ params }: Params) {
  const { type, service } = await params
  if (!TOP_TYPES[type] || !TOP_SERVICES[service]) notFound()
  return <TopListPage typeSlug={type} serviceSlug={service} />
}
