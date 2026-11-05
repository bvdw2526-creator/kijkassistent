-- Welke schermen ingelogde gebruikers openen, per Amsterdamse dag: om te zien of Kijkassistent vooral voor advies (Voor
-- jou) of ook om te ontdekken (zoeken, Nieuw, acteurspagina's, Top 100, videotheek) gebruikt wordt. Alleen voor het
-- beheer-dashboard (blok "Advies of ontdekken"). Gevuld door app/components/ScreenTracker.tsx.
--
-- Zoeken en de starthulp zijn dezelfde pagina (/onboarding): wie de starthulp nog niet heeft afgerond, telt als
-- 'starthulp', anders als 'zoeken'.
--
-- Alleen toevoegen, niets aan bestaande tabellen (zie docs/bevroren-versies.md). Gebruikers kunnen de tabel niet zelf
-- lezen of beschrijven; ze tellen alleen mee via log_screen_visit(). Alleen de beheerder leest alles. Bij het
-- verwijderen van een account gaat alles mee via on delete cascade. Bewaartermijn 18 maanden, net als app_opens.
create table if not exists public.screen_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  screen text not null check (screen in (
    'voor_jou', 'zoeken', 'starthulp', 'kijklijst', 'stats', 'instellingen', 'nieuw', 'persoon', 'top100',
    'videotheek', 'tip', 'import', 'verborgen'
  )),
  visits integer not null default 1,
  last_at timestamptz not null default now(),
  primary key (user_id, day, screen)
);

create index if not exists screen_visits_day on public.screen_visits (day);

alter table public.screen_visits enable row level security;
revoke all on public.screen_visits from anon, authenticated;
grant select on public.screen_visits to authenticated;
-- Vanaf 30 okt 2026 krijgen nieuwe tabellen geen automatische rechten meer.
grant select, insert, update, delete on public.screen_visits to service_role;

create policy "Beheerder mag schermgebruik lezen" on public.screen_visits
  for select using (public.is_app_admin());

create or replace function public.log_screen_visit(p_screen text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Europe/Amsterdam')::date;
  scr text := p_screen;
begin
  if uid is null or scr not in (
    'voor_jou', 'zoeken', 'kijklijst', 'stats', 'instellingen', 'nieuw', 'persoon', 'top100', 'videotheek', 'tip',
    'import', 'verborgen'
  ) then
    return;
  end if;

  if scr = 'zoeken' and not exists (
    select 1 from public.profiles where id = uid and onboarding_completed_at is not null
  ) then
    scr := 'starthulp';
  end if;

  insert into public.screen_visits (user_id, day, screen)
    values (uid, today, scr)
    on conflict (user_id, day, screen)
    do update set visits = public.screen_visits.visits + 1, last_at = now();

  delete from public.screen_visits where user_id = uid and day < today - interval '18 months';
end;
$$;

revoke all on function public.log_screen_visit(text) from public, anon;
grant execute on function public.log_screen_visit(text) to authenticated;

comment on table public.screen_visits is 'Welke schermen ingelogde gebruikers per dag openen (advies of ontdekken); alleen voor de beheerder, 18 maanden bewaard.';
