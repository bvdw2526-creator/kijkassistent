'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/supabase'
import { wikipediaSearchUrl } from '@/lib/wikipedia'
import { BookIcon } from './Icons'

type Book = { title: string; authors: string[]; url: string | null }

// Bewust een neutrale link (Wikipedia) en geen winkel: zolang de app TMDB gratis gebruikt,
// verdienen we niets aan doorverwijzingen. Een bol.com-partnerlink kan later, na overleg met TMDB.
// Zonder artikel over het boek: Wikipedia's zoekpagina met titel en schrijver.
const bookUrl = (book: Book) => book.url || wikipediaSearchUrl(`${book.title} ${book.authors[0] || ''}`.trim())

// Welk boek achter een boekverfilming zit (zie app/api/book-source/route.ts). Laadt los van de
// rest van de popup en toont niets zolang er geen antwoord is of als het boek onbekend is.
export default function BookSource({ mediaType, id }: { mediaType: 'movie' | 'tv'; id: number }) {
  // Met de titel erbij, zodat bij het wisselen van titel niet even het vorige boek blijft staan.
  const key = `${mediaType}-${id}`
  const [result, setResult] = useState<{ key: string; books: Book[] } | null>(null)
  const books = result?.key === key ? result.books : []

  useEffect(() => {
    let cancelled = false
    authFetch(`/api/book-source?type=${mediaType}&id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.books)) setResult({ key: `${mediaType}-${id}`, books: data.books })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mediaType, id])

  return (
    <>
      {books.map((book) => (
        <a
          key={book.title}
          href={bookUrl(book)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-start gap-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors touch-manipulation"
        >
          <BookIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Boek: <span className="italic">{book.title}</span> van {book.authors.join(' en ')}
            <span className="text-xs font-normal"> · Wikipedia</span>
          </span>
        </a>
      ))}
    </>
  )
}
