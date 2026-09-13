-- Beoordelingen die je specifiek vanuit de "Samen"-tab geeft, gekoppeld aan de
-- partner-koppeling (niet aan één van de twee accounts) — zo leert het systeem wat
-- "jullie als koppel" ergens van vinden, los van ieders individuele smaakprofiel.
-- Een "niet voor mij"-beoordeling sluit de titel voorgoed uit van toekomstige
-- Samen-aanbevelingen; "zeker leuk"/"was oké" laten de genresmaak van het koppel
-- meewegen (zie app/api/recommendations-together/route.ts).
create table if not exists couple_ratings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references partner_connections(id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null,
  title text not null,
  rating text not null check (rating in ('love', 'ok', 'dislike')),
  rated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (connection_id, tmdb_id, media_type)
);

alter table couple_ratings enable row level security;

create policy "Connected partners can read couple ratings"
  on couple_ratings for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_ratings.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  );

create policy "Connected partners can insert couple ratings"
  on couple_ratings for insert
  with check (
    rated_by = auth.uid()
    and exists (
      select 1 from partner_connections pc
      where pc.id = couple_ratings.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  );

-- Update nodig voor de upsert (onConflict op connection_id/tmdb_id/media_type): als
-- de ene partner een titel eerst als "was oké" beoordeelt, mag de andere partner die
-- later bijstellen naar "zeker leuk" — het is tenslotte een gedeelde beoordeling.
create policy "Connected partners can update couple ratings"
  on couple_ratings for update
  using (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_ratings.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_ratings.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  );
