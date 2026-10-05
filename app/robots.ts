import type { MetadataRoute } from 'next'

// Alleen de openbare pagina's laten indexeren. De rest is persoonlijk of staat achter een login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/beheer',
        '/settings',
        '/wizard',
        '/onboarding',
        '/watchlist',
        '/profiel',
        '/verborgen',
        '/import',
        '/account-verwijderen',
        '/uitnodiging',
        '/wachtwoord-resetten',
        '/wachtwoord-vergeten',
      ],
    },
    sitemap: 'https://www.kijkassistent.nl/sitemap.xml',
  }
}
