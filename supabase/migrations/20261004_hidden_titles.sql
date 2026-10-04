-- Verborgen titels: een film of serie die iemand niet wil zien in de eigen aanbevelingen (bv. omdat hij te oud is),
-- zonder er een oordeel over te geven. Anders dan een beoordeling telt dit NIET mee voor de smaak: het is alleen een
-- uitsluiting. Geldt alleen voor de eigen lijsten (Voor jou), niet voor Samen, en dus ook geen partner-leesbeleid.
-- Opruimen bij het verwijderen van een account gaat vanzelf via on delete cascade.
create table if not exists public.hidden_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, tmdb_id, media_type)
);

alter table public.hidden_titles enable row level security;

create policy "Users can read their own hidden titles"
  on public.hidden_titles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own hidden titles"
  on public.hidden_titles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own hidden titles"
  on public.hidden_titles for delete
  to authenticated
  using (auth.uid() = user_id);
