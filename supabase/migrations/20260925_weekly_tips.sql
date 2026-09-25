-- Tip van de week: per gebruiker, week en soort (film/serie) één vastgezette tip, zodat hij de hele
-- week hetzelfde blijft en we de week erna kunnen vragen of je hem gezien hebt.
create table if not exists public.weekly_tips (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Maandag van de week (lokale datum van de gebruiker).
  week_start date not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null,
  poster_path text,
  explanation text,
  watch_on text,
  -- "Nog niet gezien" bij de vervolgvraag van de week erna.
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, media_type)
);

alter table public.weekly_tips enable row level security;

create policy "eigen tips lezen" on public.weekly_tips
  for select to authenticated using (user_id = (select auth.uid()));
create policy "eigen tips toevoegen" on public.weekly_tips
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "eigen tips aanpassen" on public.weekly_tips
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "eigen tips verwijderen" on public.weekly_tips
  for delete to authenticated using (user_id = (select auth.uid()));
