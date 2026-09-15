-- tmdb_credits_cache had Row Level Security aan staan, maar nog geen enkele policy —
-- daardoor kon niemand (ook geen ingelogde gebruiker via de app) deze tabel lezen of
-- schrijven. Gevolg: de cache voor favoriete acteurs/regisseurs (getCreditsBulk in
-- lib/recommendationEngine.ts) kon nooit iets opslaan en stond op 0 rijen — de feature
-- bleef wel werken (valt terug op een live TMDB-opzoeking), maar zonder caching, dus met
-- onnodige extra TMDB-calls bij elke berekening. Zelfde policy-patroon als de andere
-- gedeelde TMDB-cache-tabellen.
create policy "authenticated read/write"
  on public.tmdb_credits_cache for all
  to authenticated
  using (true)
  with check (true);
