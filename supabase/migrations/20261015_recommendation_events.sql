-- Wat er met een aanbeveling gebeurt vóórdat iemand hem beoordeelt: welke titels er in beeld kwamen ("getoond"), welke
-- iemand opende ("geopend") en welke er zonder oordeel van de kijklijst af gingen ("afgehaakt"). Beoordelen, favoriet maken
-- en op de kijklijst zetten staan al in source_info (zie 20261008_recommendation_outcome.sql) en worden hier niet herhaald.
-- Samen geven ze een eerlijke noemer voor de trefkans: niet alleen hoe vaak een gekozen titel raak was, maar hoeveel van wat
-- we lieten zien uiteindelijk raak was.
--
-- Alleen toevoegen, niets aan bestaande tabellen (zie docs/bevroren-versies.md). Gebruikers mogen alleen hun eigen regels
-- toevoegen en lezen; alleen de beheerder leest alles. Bij het verwijderen van een account gaat alles mee via on delete
-- cascade. Bewaartermijn 18 maanden: opruimen gebeurt bij het verversen van het beheer-dashboard (er is geen pg_cron).
create table if not exists public.recommendation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Alleen bij Samen en Onze lijst. Wordt de koppeling verbroken, dan blijft de gebeurtenis van de gebruiker zelf staan.
  connection_id uuid references public.partner_connections(id) on delete set null,
  event text not null check (event in ('getoond', 'geopend', 'afgehaakt')),
  screen text not null check (screen in ('voor_jou', 'kijklijst', 'onze_lijst')),
  -- Tabblad, zoals in source_info.mode: focused, balanced, explore, samen, halloween of halloween-samen. Bij afgehaakt het
  -- tabblad waaruit de titel op de lijst kwam (leeg als hij niet via Voor jou kwam).
  mode text,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  -- Plek in de lijst (1 = bovenaan) en het percentage op dat moment; alleen bij Voor jou.
  position integer,
  match integer,
  upcoming boolean not null default false,
  -- Alleen bij afgehaakt: hoeveel dagen de titel op de lijst stond.
  days_on_list integer,
  created_at timestamptz not null default now(),
  -- Per Amsterdamse dag telt dezelfde gebeurtenis één keer (de lijst wordt vaak opnieuw getoond).
  day date generated always as ((created_at at time zone 'Europe/Amsterdam')::date) stored
);

create unique index if not exists recommendation_events_once_per_day
  on public.recommendation_events (user_id, event, screen, mode, media_type, tmdb_id, day) nulls not distinct;
create index if not exists recommendation_events_created_at on public.recommendation_events (created_at);

alter table public.recommendation_events enable row level security;

create policy "Gebruikers voegen eigen gebeurtenissen toe" on public.recommendation_events
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Beheerder mag gebeurtenissen lezen" on public.recommendation_events
  for select using (public.is_app_admin());

-- Nodig voor "dubbele overslaan" (insert ... on conflict do nothing): Postgres eist dan dat je de rij ook mag lezen.
-- Alleen je eigen regels; de app leest ze verder niet.
create policy "Gebruikers lezen eigen gebeurtenissen" on public.recommendation_events
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.recommendation_events is 'Getoond, geopend en afgehaakt per aanbeveling, voor de trefkans; alleen voor de beheerder, 18 maanden bewaard.';
