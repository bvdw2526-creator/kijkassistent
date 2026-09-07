import type { Metadata } from 'next'
import { Fraunces } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'Kijkassistent',
  description: 'Persoonlijke films- en series-aanbevelingen',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={fraunces.variable}>
      <body className="bg-[#171F2B] text-[#F2EFE9] min-h-screen">{children}</body>
    </html>
  )
}