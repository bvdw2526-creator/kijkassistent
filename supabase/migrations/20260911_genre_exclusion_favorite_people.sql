-- Genres uitsluiten: platte lijst van TMDB genre-ids die de gebruiker nooit wil zien.
-- Movie- en tv-genre-ids overlappen nooit in betekenis (bv. actie is 28 bij films,
-- 10759 bij series, en gedeelde ids zoals 35 "Komedie" betekenen bij allebei hetzelfde),
-- dus één platte kolom volstaat voor beide media-types.
alter table profiles add column if not exists excluded_genres jsonb not null default '[]'::jsonb;

-- Favoriete acteurs/actrices: tellen zwaar mee in de aanbevelingen (zie
-- ACTOR_MATCH_WEIGHT in app/api/recommendations/route.ts).
create table if not exists favorite_people (
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id integer not null,
  name text not null,
  profile_path text,
  added_at timestamptz not null default now(),
  primary key (user_id, person_id)
);

alter table favorite_people enable row level security;

create policy "Users can read their own favorite people"
  on favorite_people for select
  using (auth.uid() = user_id);

create policy "Users can insert their own favorite people"
  on favorite_people for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own favorite people"
  on favorite_people for delete
  using (auth.uid() = user_id);

-- Cache voor TMDB cast-opzoekingen (credits-endpoint), alleen nodig zodra een
-- gebruiker favoriete acteurs heeft ingesteld — zie getCastBulk in de
-- recommendations-route. Kolom heet "cast_members" i.p.v. "cast" om het gereserveerde
-- SQL-woord CAST te vermijden.
create table if not exists tmdb_credits_cache (
  media_type text not null,
  tmdb_id integer not null,
  cast_members jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);
