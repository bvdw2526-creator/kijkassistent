import type { Metadata, Viewport } from 'next'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import './globals.css'
import RegisterServiceWorker from './components/RegisterServiceWorker'
import LocaleSync from './components/LocaleSync'
import SkinBackdrop from './components/SkinBackdrop'
import SkinInitScript from './components/SkinInitScript'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })
const body = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body' })

const SITE_URL = 'https://www.kijkassistent.nl'

// Titel en beschrijving in de taal van de app (messages/*.json, "meta").
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getTranslations('meta')
  const title = t('title')
  const description = t('description')
  return {
    metadataBase: new URL(SITE_URL),
    // Pagina's met een eigen titel (bv. privacy) bevatten de naam al zelf.
    title: { default: title, template: '%s' },
    description,
    applicationName: 'Kijkassistent',
    openGraph: {
      type: 'website',
      siteName: 'Kijkassistent',
      locale: locale === 'en' ? 'en_GB' : 'nl_NL',
      url: SITE_URL,
      title,
      description,
    },
    twitter: { card: 'summary_large_image', title, description },
    icons: { apple: '/icons/apple-touch-icon.png' },
    appleWebApp: { capable: true, title: 'Kijkassistent', statusBarStyle: 'black-translucent' },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#10151C',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const tm = await getTranslations('meta')
  // suppressHydrationWarning: het skin-script zet data-skin op <html> voordat React de pagina overneemt.
  return (
    <html lang={locale} className={`${fraunces.variable} ${body.variable}`} suppressHydrationWarning>
      <body className="bg-glow text-foreground min-h-screen antialiased">
        <SkinInitScript />
        <SkinBackdrop />
        {/* Gestructureerde gegevens voor Google: wat Kijkassistent is. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Kijkassistent',
              url: SITE_URL,
              description: tm('description'),
              applicationCategory: 'EntertainmentApplication',
              operatingSystem: 'Web, Android',
              inLanguage: locale === 'en' ? 'en' : 'nl-NL',
            }),
          }}
        />
        <NextIntlClientProvider>
          {children}
          <LocaleSync />
        </NextIntlClientProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  )
}