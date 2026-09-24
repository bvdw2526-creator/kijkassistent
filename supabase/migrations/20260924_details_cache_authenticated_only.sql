-- De details-cache stond open voor iedereen (rol "public", dus ook zonder in te loggen, met alleen
-- de publieke sleutel uit de browser): wie wilde kon genres en samenvattingen overschrijven of
-- wissen, en daarmee de aanbevelingen van alle gebruikers beïnvloeden. Nu net als de andere
-- tmdb_*-cachetabellen alleen voor ingelogde gebruikers.
drop policy if exists "Iedereen mag de gedeelde details-cache lezen en schrijven" on public.tmdb_details_cache;

create policy "authenticated read/write"
  on public.tmdb_details_cache
  for all
  to authenticated
  using (true)
  with check (true);
