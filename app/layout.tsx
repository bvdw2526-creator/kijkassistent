import type { Metadata, Viewport } from 'next'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import './globals.css'
import RegisterServiceWorker from './components/RegisterServiceWorker'
import SkinBackdrop from './components/SkinBackdrop'
import SkinInitScript from './components/SkinInitScript'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })
const body = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body' })

const SITE_URL = 'https://www.kijkassistent.nl'
const SITE_TITLE = 'Kijkassistent: film- en serietips op jouw streamingdiensten'
const SITE_DESCRIPTION =
  'Kijkassistent kiest films en series die bij jouw smaak passen en die je op jouw streamingdiensten kunt kijken. Ook samen met je partner.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Pagina's met een eigen titel (bv. privacy) bevatten de naam al zelf.
  title: { default: SITE_TITLE, template: '%s' },
  description: SITE_DESCRIPTION,
  applicationName: 'Kijkassistent',
  openGraph: {
    type: 'website',
    siteName: 'Kijkassistent',
    locale: 'nl_NL',
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
  icons: { apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Kijkassistent', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#10151C',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
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
              description: SITE_DESCRIPTION,
              applicationCategory: 'EntertainmentApplication',
              operatingSystem: 'Web, Android',
              inLanguage: 'nl-NL',
            }),
          }}
        />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  )
}