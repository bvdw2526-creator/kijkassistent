-- Momentopnames van de opgeslagen aanbevelingslijsten, om na een wijziging aan de berekening te kunnen zien welke titels er
-- bij kwamen of verdwenen (zie docs/bevroren-versies.md). Alleen de beheerder kan ze lezen; vullen gebeurt via de
-- database-koppeling (SQL), niet vanuit de app.
create table if not exists public.recommendation_snapshots (
  id bigint generated always as identity primary key,
  label text not null,
  created_at timestamptz not null default now(),
  -- 'persoonlijk' (recommendations_cache, per gebruiker) of 'samen' (couple_recommendations_cache, per koppeling)
  kind text not null check (kind in ('persoonlijk', 'samen')),
  owner_id uuid not null,
  signature_prefix text,
  lists jsonb not null
);
alter table public.recommendation_snapshots enable row level security;
create policy "Beheerder mag momentopnames lezen" on public.recommendation_snapshots
  for select using (public.is_app_admin());

comment on table public.recommendation_snapshots is 'Momentopnames van aanbevelingslijsten per bevroren versie van de berekening; alleen voor de beheerder.';
