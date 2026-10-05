import type { MetadataRoute } from 'next'
import { TOP_TYPES, TOP_SERVICES } from '@/lib/topLists'

const SITE_URL = 'https://www.kijkassistent.nl'

// De openbare pagina's. Voeg hier nieuwe openbare pagina's (bv. een uitlegpagina) aan toe.
export default function sitemap(): MetadataRoute.Sitemap {
  const topLists: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/top-100`, changeFrequency: 'weekly', priority: 0.8 },
    ...Object.keys(TOP_TYPES).flatMap((typeSlug) => [
      { url: `${SITE_URL}/top-100/${typeSlug}`, changeFrequency: 'weekly' as const, priority: 0.7 },
      ...Object.keys(TOP_SERVICES).map((serviceSlug) => ({
        url: `${SITE_URL}/top-100/${typeSlug}/${serviceSlug}`,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ]),
  ]
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/register`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/voorwaarden`, changeFrequency: 'yearly', priority: 0.2 },
    ...topLists,
  ]
}
