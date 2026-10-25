import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import VideotheekStore from './VideotheekStore'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('publicVideotheek')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

// Openbare pagina: zonder account door een videotheek uit de jaren 90 lopen (zie app/api/public-videotheek).
// Altijd in de kleuren van de Videotheek-skin, welke skin de bezoeker ook heeft (zie .skin-videotheek in globals.css).
export default function VideotheekPage() {
  return (
    <div className="skin-videotheek bg-glow text-foreground min-h-screen">
      <VideotheekStore />
    </div>
  )
}
