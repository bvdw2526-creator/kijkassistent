import type { Metadata } from 'next'

// Pagina's achter de persoonlijke links uit de tipsmail: niet voor zoekmachines.
export const metadata: Metadata = {
  title: 'Kijkassistent',
  robots: { index: false, follow: false },
}

export default function MailLayout({ children }: { children: React.ReactNode }) {
  return children
}
