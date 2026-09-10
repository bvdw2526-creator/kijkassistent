-- Cache voor het complete, berekende aanbevelingsresultaat per gebruiker.
-- Losse TMDB-calls worden al per titel gecached (tmdb_*_cache tabellen), maar de hele
-- pijplijn (favorieten ophalen, scores berekenen, embeddings vergelijken, kijkproviders
-- checken) liep bij elke app-start opnieuw. Deze tabel slaat het eindresultaat op zodat
-- een herhaald bezoek zonder wijzigingen in favorieten/ratings/watchlist/streamingdiensten
-- direct uit cache bediend kan worden.
--
-- "signature" vangt de staat waarop het resultaat is gebaseerd. Wijzigt die (nieuwe
-- rating, favoriet, watchlist-item of streamingdienst), dan is de cache-rij automatisch
-- ongeldig en wordt er gewoon opnieuw berekend — geen aparte invalidatie-logica nodig.
create table if not exists recommendations_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature text not null,
  focused jsonb not null default '[]'::jsonb,
  balanced jsonb not null default '[]'::jsonb,
  explore jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table recommendations_cache enable row level security;

create policy "Users can read their own recommendations cache"
  on recommendations_cache for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own recommendations cache"
  on recommendations_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own recommendations cache"
  on recommendations_cache for update
  using (auth.uid() = user_id);
