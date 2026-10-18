import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TOP_TYPES } from '@/lib/topLists'
import TopListPage from '../../components/TopListPage'

// De lijst wordt een dag hergebruikt en daarna op de achtergrond vernieuwd.
export const revalidate = 86400

type Params = { params: Promise<{ type: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { type } = await params
  if (!TOP_TYPES[type]) return {}
  const t = await getTranslations('top')
  return {
    title: t('metaTypeTitle', { type: t(type) }),
    description: t('metaTypeDescription', { type: t(type) }),
  }
}

export default async function Page({ params }: Params) {
  const { type } = await params
  if (!TOP_TYPES[type]) notFound()
  return <TopListPage typeSlug={type} serviceSlug={null} />
}
