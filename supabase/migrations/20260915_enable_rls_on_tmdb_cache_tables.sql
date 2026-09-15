-- Deze 4 gedeelde TMDB-cache-tabellen waren ooit rechtstreeks in de Supabase SQL Editor
-- aangemaakt (staan daarom nergens anders in deze migratiemap) en hadden per ongeluk
-- geen Row Level Security aan staan — daardoor kon iedereen met de publieke anon-key
-- (die toch al in elke client-bundel zit) ze rechtstreeks lezen én wijzigen, buiten de
-- app om. Geen persoonsgegevens in deze tabellen (puur gedeelde TMDB-cache), maar wel
-- een risico dat iemand de gedeelde cache kon vervuilen voor alle gebruikers.
--
-- Bij 3 van de 4 stond de juiste policy ("authenticated read/write") al klaar, alleen
-- nooit geactiveerd:
alter table public.tmdb_discover_cache enable row level security;
alter table public.tmdb_collection_cache enable row level security;
alter table public.tmdb_recommendations_cache enable row level security;

-- Deze had nog helemaal geen policy, dus beide nodig — zelfde patroon als de rest:
alter table public.tmdb_watch_providers_cache enable row level security;

create policy "authenticated read/write"
  on public.tmdb_watch_providers_cache for all
  to authenticated
  using (true)
  with check (true);
