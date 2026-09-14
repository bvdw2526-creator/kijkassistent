-- Favoriete regisseurs: zelfde opzet als favorite_people (favoriete acteurs/actrices),
-- tellen zwaar mee in de aanbevelingen naast de bestaande ACTOR_MATCH_WEIGHT (zie
-- DIRECTOR_MATCH_WEIGHT in lib/recommendationEngine.ts).
--
-- Belangrijk: deze bonus kan nooit een uitgesloten genre "omzeilen". Een titel komt pas
-- in aanmerking voor een regisseur- of acteur-bonus als hij al via een ander signaal
-- (favoriet, beoordeling, genre-ontdekking, collectie) als kandidaat is toegevoegd — en
-- die stap filtert al op excluded_genres. Een film van een favoriete regisseur in een
-- uitgesloten genre haalt de kandidatenlijst dus sowieso nooit, ongeacht deze tabel.
create table if not exists favorite_directors (
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id integer not null,
  name text not null,
  profile_path text,
  added_at timestamptz not null default now(),
  primary key (user_id, person_id)
);

alter table favorite_directors enable row level security;

create policy "Users can read their own favorite directors"
  on favorite_directors for select
  using (auth.uid() = user_id);

create policy "Users can insert their own favorite directors"
  on favorite_directors for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own favorite directors"
  on favorite_directors for delete
  using (auth.uid() = user_id);

-- Zelfde partner-leesbeleid als favorite_people/ratings/watchlist/profiles (zie de
-- partner_connections-migratie) — nodig zodat de "Samen"-route ook de favoriete
-- regisseurs van de partner mag lezen bij het berekenen van de gedeelde aanbevelingen.
create policy "Accepted partner can read favorite directors"
  on favorite_directors for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = auth.uid() and pc.partner_id = favorite_directors.user_id)
          or (pc.partner_id = auth.uid() and pc.requester_id = favorite_directors.user_id))
    )
  );

-- Regisseurs (crew, job "Director") worden voortaan samen met de cast opgehaald en
-- gecached vanuit hetzelfde TMDB /credits-endpoint — geen extra TMDB-call nodig.
alter table tmdb_credits_cache add column if not exists directors jsonb not null default '[]'::jsonb;
