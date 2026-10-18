import type { SupabaseClient } from '@supabase/supabase-js'
import type { Locale } from './locale'

// De aanbevelingen worden met Nederlandse titels en samenvattingen berekend en bewaard (recommendations_cache en de
// gedeelde TMDB-caches). Voor de Engelse app wisselen we ze bij het versturen om voor de Engelse titel en samenvatting
// die al in tmdb_features_cache staan (title_en / overview_en, bewaard voor de Engelse verhaal-vingerafdrukken).
// Zonder Engelse tekst in de cache blijft de Nederlandse staan. De berekening en wat er bewaard wordt veranderen niet.

const CHUNK = 200

type Localizable = { id: number; media_type: 'movie' | 'tv'; title: string; overview?: string }

export async function localizeTitles<T extends Localizable>(supabase: SupabaseClient, items: T[], locale: Locale): Promise<T[]> {
  if (locale !== 'en' || items.length === 0) return items
  const english = new Map<string, { title: string | null; overview: string | null }>()
  for (const mediaType of ['movie', 'tv'] as const) {
    const ids = [...new Set(items.filter((i) => i.media_type === mediaType).map((i) => i.id))]
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data } = await supabase
        .from('tmdb_features_cache')
        .select('tmdb_id, title_en, overview_en')
        .eq('media_type', mediaType)
        .in('tmdb_id', ids.slice(i, i + CHUNK))
      for (const row of data ?? []) english.set(`${mediaType}-${row.tmdb_id}`, { title: row.title_en, overview: row.overview_en })
    }
  }
  return items.map((item) => {
    const en = english.get(`${item.media_type}-${item.id}`)
    if (!en) return item
    return {
      ...item,
      title: en.title || item.title,
      ...(item.overview !== undefined ? { overview: en.overview || item.overview } : {}),
    }
  })
}

// Zelfde voor een object met lijsten per tabblad (focused/balanced/explore).
export async function localizeModes<K extends string, T extends Localizable>(
  supabase: SupabaseClient,
  lists: Record<K, T[]>,
  locale: Locale
): Promise<Record<K, T[]>> {
  if (locale !== 'en') return lists
  const all = (Object.values(lists) as T[][]).flat()
  const localized = await localizeTitles(supabase, all, locale)
  const byKey = new Map(localized.map((i) => [`${i.media_type}-${i.id}`, i]))
  const out = {} as Record<K, T[]>
  for (const key of Object.keys(lists) as K[]) out[key] = lists[key].map((i) => byKey.get(`${i.media_type}-${i.id}`) ?? i)
  return out
}
