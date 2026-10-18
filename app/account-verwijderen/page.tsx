import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('deletePage')
  return { title: t('metaTitle') }
}

const CONTACT = 'info@kijkassistent.nl'

// Openbaar bereikbaar zonder in te loggen: Google Play eist een webadres waar gebruikers kunnen
// lezen hoe ze hun account en gegevens laten verwijderen.
export default async function AccountVerwijderen() {
  const t = await getTranslations('deletePage')
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">{t('back')}</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">{t('heading')}</h1>
      <p className="text-muted mb-8">{t('sub')}</p>

      <Section title={t('selfTitle')}>
        <ol className="list-decimal pl-5 space-y-1">
          <li>{t('self1')}</li>
          <li>{t.rich('self2', { b: strong })}</li>
          <li>{t.rich('self3', { b: strong })}</li>
          <li>{t.rich('self4', { b: strong })}</li>
        </ol>
        <p className="mt-3">{t('selfNote')}</p>
      </Section>

      <Section title={t('removedTitle')}>
        <ul className="list-disc pl-5 space-y-1">
          {(['removed1', 'removed2', 'removed3', 'removed4', 'removed5', 'removed6'] as const).map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('anonTitle')}>
        <p>{t('anonText')}</p>
      </Section>

      <Section title={t('noLoginTitle')}>
        <p>
          {t.rich('noLoginText', {
            mail: () => (
              <a href={`mailto:${CONTACT}`} className="text-accent">
                {CONTACT}
              </a>
            ),
          })}
        </p>
      </Section>

      <Section title={t('moreTitle')}>
        <p>
          {t.rich('moreText', {
            link: (chunks) => (
              <Link href="/privacy" className="text-accent">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="font-display text-xl mb-2">{title}</h2>
      <div className="text-foreground/90 text-sm">{children}</div>
    </section>
  )
}
