// Bulkopslag in de gedeelde caches altijd in dezelfde volgorde (op de sleutel van de tabel). Twee berekeningen die
// tegelijk deels dezelfde titels wegschrijven, pakken de rijen dan in dezelfde volgorde vast: de tweede wacht even op de
// eerste in plaats van dat ze elkaar blokkeren. Zonder sortering hangt de volgorde af van welke TMDB-aanroep het eerst
// klaar was, en dat gaf op 21 okt 2026 een deadlock (500 op tmdb_watch_providers_cache bij twee Samen-berekeningen).
export function inLockOrder<T extends object, K extends keyof T>(rows: T[], keys: K[]): T[] {
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const x = a[k]
      const y = b[k]
      if (x === y) continue
      return (x as string | number) < (y as string | number) ? -1 : 1
    }
    return 0
  })
}
