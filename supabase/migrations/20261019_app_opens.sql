-- Hoe vaak iemand Kijkassistent opent, per Amsterdamse dag en per soort: de Android-app (Capacitor, herkenbaar aan
-- "KijkassistentApp/Android" in de user agent), de geïnstalleerde versie (oude TWA of PWA op het startscherm) of de
-- gewone browser. Zo ziet de beheerder in het dashboard welke testers de Android-app echt gebruiken (nodig voor de
-- gesloten test in Google Play) en hoe vaak.
--
-- Alleen toevoegen, niets aan bestaande tabellen (zie docs/bevroren-versies.md). Gebruikers kunnen de tabel niet zelf
-- lezen of beschrijven; ze tellen alleen mee via log_app_open(). Alleen de beheerder leest alles. Bij het verwijderen
-- van een account gaat alles mee via on delete cascade. Bewaartermijn 18 maanden: log_app_open() ruimt oudere regels
-- van de gebruiker zelf op.
create table if not exists public.app_opens (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  platform text not null check (platform in ('android_app', 'installed', 'web')),
  opens integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, day, platform)
);

create index if not exists app_opens_day on public.app_opens (day);

alter table public.app_opens enable row level security;
revoke all on public.app_opens from anon, authenticated;
grant select on public.app_opens to authenticated;

create policy "Beheerder mag app-gebruik lezen" on public.app_opens
  for select using (public.is_app_admin());

create or replace function public.log_app_open(p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if uid is null or p_platform not in ('android_app', 'installed', 'web') then
    return;
  end if;

  insert into public.app_opens (user_id, day, platform)
    values (uid, today, p_platform)
    on conflict (user_id, day, platform)
    do update set opens = public.app_opens.opens + 1, last_at = now();

  delete from public.app_opens where user_id = uid and day < today - interval '18 months';
end;
$$;

revoke all on function public.log_app_open(text) from public, anon;
grant execute on function public.log_app_open(text) to authenticated;

comment on table public.app_opens is 'Aantal keer dat de app geopend is per dag en soort (Android-app, geïnstalleerd, browser); alleen voor de beheerder, 18 maanden bewaard.';
