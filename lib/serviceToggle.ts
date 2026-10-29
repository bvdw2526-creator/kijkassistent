// Een streamingdienst aan- of uitvinken. NPO Plus is de betaalde versie van NPO Start: wie NPO Plus heeft, kan alles van
// NPO Start ook kijken. Bij TMDB staan ze los (NPO Start 360, NPO Plus 1986), dus bij het aanvinken van NPO Plus gaat
// NPO Start mee aan. Uitvinken doet alleen die ene dienst, zodat je NPO Start los kunt houden.
export function toggleServiceList(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((s) => s !== id)
  const next = [...current, id]
  if (id === 'npo_plus' && !next.includes('npo_start')) next.push('npo_start')
  return next
}
