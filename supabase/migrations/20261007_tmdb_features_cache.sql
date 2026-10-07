-- Kenmerken van een titel waarvan de smaak leert: trefwoorden/thema's (TMDB-keywords), regisseurs (bij series de
-- bedenkers), jaar en oorspronkelijke taal. Gedeeld tussen alle gebruikers, net als de andere tmdb_*-cachetabellen:
-- haalt één gebruiker een titel op, dan profiteren alle anderen ervan. Deze gegevens veranderen bijna nooit, dus lang
-- bewaren (zie FEATURES_CACHE_MAX_AGE_HOURS in lib/titleFeatures.ts). Alleen voor ingelogde gebruikers.
create table if not exists public.tmdb_features_cache (
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  keywords jsonb not null default '[]'::jsonb,
  directors jsonb not null default '[]'::jsonb,
  year integer,
  language text,
  fetched_at timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);

alter table public.tmdb_features_cache enable row level security;

create policy "authenticated read/write"
  on public.tmdb_features_cache
  for all
  to authenticated
  using (true)
  with check (true);
