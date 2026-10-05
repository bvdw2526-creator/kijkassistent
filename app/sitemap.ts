import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.kijkassistent.nl'

// De openbare pagina's. Voeg hier nieuwe openbare pagina's (bv. een uitlegpagina) aan toe.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/register`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/voorwaarden`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
