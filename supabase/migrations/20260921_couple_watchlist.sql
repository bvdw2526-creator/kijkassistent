-- Gezamenlijke watchlist ("Onze lijst") voor gekoppelde partners. Hangt aan de koppeling: als
-- die verdwijnt (of een account wordt verwijderd) verdwijnt de lijst mee. Beide partners mogen
-- lezen, toevoegen en verwijderen; niemand anders.
create table if not exists public.couple_watchlist (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.partner_connections (id) on delete cascade,
  tmdb_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  watch_on text,
  watch_url text,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  unique (connection_id, tmdb_id, media_type)
);

create index if not exists couple_watchlist_connection_id_idx on public.couple_watchlist (connection_id);

alter table public.couple_watchlist enable row level security;

create policy "Partners lezen gezamenlijke watchlist" on public.couple_watchlist
  for select to authenticated
  using (exists (
    select 1 from public.partner_connections pc
    where pc.id = connection_id and pc.status = 'accepted'
      and (pc.requester_id = (select auth.uid()) or pc.partner_id = (select auth.uid()))
  ));

create policy "Partners voegen toe aan gezamenlijke watchlist" on public.couple_watchlist
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.partner_connections pc
      where pc.id = connection_id and pc.status = 'accepted'
        and (pc.requester_id = (select auth.uid()) or pc.partner_id = (select auth.uid()))
    )
  );

create policy "Partners verwijderen van gezamenlijke watchlist" on public.couple_watchlist
  for delete to authenticated
  using (exists (
    select 1 from public.partner_connections pc
    where pc.id = connection_id and pc.status = 'accepted'
      and (pc.requester_id = (select auth.uid()) or pc.partner_id = (select auth.uid()))
  ));
