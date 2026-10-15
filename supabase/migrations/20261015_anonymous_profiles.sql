-- Anoniem bewaren bij het verwijderen van een account. Wat bruikbaar is voor analyse (smaak, voorkeuren, Samen-oordelen)
-- blijft bewaard onder een willekeurige code (anon_id) die niet aan het account te koppelen is; alles wat naar de persoon
-- leidt (e-mailadres, inloggegevens, partnerkoppeling, exacte tijdstippen) gaat weg. Zo blijft te zien dat wie X leuk
-- vond ook Y leuk vond, zonder dat bekend is wie dat was.
--
-- Tijden alleen per maand, titels alleen als TMDB-id. In source_info valt het exacte tijdstip (addedAt) weg. Alleen de
-- beheerder leest. Gebeurtenissen (recommendation_events) staan al anoniem in recommendation_stats_monthly.
create table if not exists public.anon_profiles (
  anon_id uuid primary key default gen_random_uuid(),
  signup_month date,
  removed_month date not null default (date_trunc('month', now() at time zone 'Europe/Amsterdam'))::date,
  streaming_services text[] not null default '{}',
  excluded_genres jsonb not null default '[]'::jsonb,
  min_year integer,
  onboarded boolean not null default false,
  had_partner boolean not null default false
);

create table if not exists public.anon_title_signals (
  id bigint generated always as identity primary key,
  anon_id uuid not null references public.anon_profiles(anon_id) on delete cascade,
  -- beoordeling: value = love/ok/dislike; favoriet; kijklijst (stond er nog op); verborgen: reason = bv. te_oud;
  -- samen: value = love/ok/dislike, reason = niet_voor_ons/samen_gezien (leeg = gewone Samen-beoordeling).
  kind text not null check (kind in ('beoordeling', 'favoriet', 'kijklijst', 'verborgen', 'samen')),
  media_type text not null,
  tmdb_id integer not null,
  value text,
  reason text,
  month date,
  source_info jsonb
);
create index if not exists anon_title_signals_title on public.anon_title_signals (media_type, tmdb_id);
create index if not exists anon_title_signals_anon on public.anon_title_signals (anon_id);

create table if not exists public.anon_people (
  anon_id uuid not null references public.anon_profiles(anon_id) on delete cascade,
  role text not null check (role in ('acteur', 'regisseur')),
  person_id integer not null,
  primary key (anon_id, role, person_id)
);

alter table public.anon_profiles enable row level security;
alter table public.anon_title_signals enable row level security;
alter table public.anon_people enable row level security;
create policy "Beheerder mag anonieme profielen lezen" on public.anon_profiles for select using (public.is_app_admin());
create policy "Beheerder mag anonieme signalen lezen" on public.anon_title_signals for select using (public.is_app_admin());
create policy "Beheerder mag anonieme personen lezen" on public.anon_people for select using (public.is_app_admin());

comment on table public.anon_profiles is 'Anonieme profielen van verwijderde accounts (willekeurige code, niet te koppelen aan het account); alleen voor analyse.';
comment on table public.anon_title_signals is 'Beoordelingen, favorieten, kijklijst, verborgen titels en Samen-oordelen van verwijderde accounts, per anoniem profiel en per maand.';
comment on table public.anon_people is 'Favoriete acteurs en regisseurs van verwijderde accounts, per anoniem profiel.';

-- Kopieert het bruikbare deel van een account naar de anonieme tabellen en geeft de nieuwe anon_id terug. Wist zelf
-- niets: dat doet delete_my_account daarna. Ook te gebruiken door de beheerder vóór het met de hand verwijderen van een
-- account (verzoek per e-mail): select public.anonymize_user('<user-id>');
create or replace function public.anonymize_user(target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  aid uuid;
begin
  insert into public.anon_profiles (signup_month, streaming_services, excluded_genres, min_year, onboarded, had_partner)
  select date_trunc('month', p.created_at)::date,
    coalesce(p.streaming_services, '{}'),
    coalesce(p.excluded_genres, '[]'::jsonb),
    p.min_year,
    p.onboarding_completed_at is not null,
    exists (select 1 from public.partner_connections c where c.status = 'accepted' and (c.requester_id = target or c.partner_id = target))
  from public.profiles p where p.id = target
  returning anon_id into aid;

  -- Ook zonder profielrij (zou niet moeten) de rest bewaren.
  if aid is null then
    insert into public.anon_profiles default values returning anon_id into aid;
  end if;

  insert into public.anon_title_signals (anon_id, kind, media_type, tmdb_id, value, month, source_info)
  select aid, 'beoordeling', media_type, tmdb_id, rating, date_trunc('month', rated_at)::date, source_info - 'addedAt'
  from public.ratings where user_id = target;

  insert into public.anon_title_signals (anon_id, kind, media_type, tmdb_id, month, source_info)
  select aid, 'favoriet', media_type, tmdb_id, date_trunc('month', added_at)::date, source_info - 'addedAt'
  from public.favorite_movies where user_id = target;

  insert into public.anon_title_signals (anon_id, kind, media_type, tmdb_id, month, source_info)
  select aid, 'kijklijst', media_type, tmdb_id, date_trunc('month', added_at)::date,
    coalesce(source_info, case when source_mode is not null then jsonb_build_object('mode', source_mode) end) - 'addedAt'
  from public.watchlist where user_id = target;

  insert into public.anon_title_signals (anon_id, kind, media_type, tmdb_id, reason, month)
  select aid, 'verborgen', media_type, tmdb_id, reason, date_trunc('month', hidden_at at time zone 'Europe/Amsterdam')::date
  from public.hidden_titles where user_id = target;

  insert into public.anon_title_signals (anon_id, kind, media_type, tmdb_id, value, reason, month)
  select aid, 'samen', media_type, tmdb_id, rating, reason, date_trunc('month', created_at at time zone 'Europe/Amsterdam')::date
  from public.couple_ratings where rated_by = target;

  insert into public.anon_people (anon_id, role, person_id)
  select aid, 'acteur', person_id from public.favorite_people where user_id = target
  on conflict do nothing;
  insert into public.anon_people (anon_id, role, person_id)
  select aid, 'regisseur', person_id from public.favorite_directors where user_id = target
  on conflict do nothing;

  return aid;
end;
$$;

revoke execute on function public.anonymize_user(uuid) from public, anon, authenticated;
