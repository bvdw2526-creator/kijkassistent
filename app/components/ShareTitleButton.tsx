'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { share } from '@/lib/native'
import { ShareIcon } from './Icons'

// "Delen" in de titel-popups. In de app opent het deelmenu van de telefoon (WhatsApp, Berichten, ...), in de browser
// dat van de browser, en anders kopiëren we de tekst.
export default function ShareTitleButton({ title, year, service }: { title: string; year?: string; service?: string }) {
  const t = useTranslations('title')
  const [copied, setCopied] = useState(false)

  async function onShare() {
    const text = t('shareText', {
      title,
      year: year ? ` (${year})` : '',
      service: service ? ` ${t('shareOn', { service })}` : '',
    })
    const result = await share({ title, text, url: 'https://www.kijkassistent.nl', dialogTitle: t('share') })
    if (result === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="mt-3 flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors touch-manipulation"
    >
      <ShareIcon className="w-4 h-4 flex-shrink-0" />
      {copied ? t('shareCopied') : t('share')}
    </button>
  )
}
