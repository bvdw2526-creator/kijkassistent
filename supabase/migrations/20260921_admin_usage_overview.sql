-- Gebruiksoverzicht voor de beheerder. Alleen accounts in app_admins mogen de cijfers ophalen; de
-- functies lezen over alle gebruikers heen (SECURITY DEFINER), dus de controle zit in de functie zelf.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

insert into public.app_admins (user_id)
  select id from auth.users where email = 'bvdw2526@gmail.com'
  on conflict do nothing;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.admin_usage_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Geen toegang';
  end if;

  -- Alles wat een gebruiker doet, met tijdstip in Nederlandse tijd. De oudere tabellen bewaren
  -- tijd zonder tijdzone (UTC).
  with events as (
    select user_id, (added_at at time zone 'UTC') at time zone 'Europe/Amsterdam' as at_local, 'favoriet' as kind from public.favorite_movies
    union all select user_id, (rated_at at time zone 'UTC') at time zone 'Europe/Amsterdam', 'beoordeling' from public.ratings
    union all select user_id, (added_at at time zone 'UTC') at time zone 'Europe/Amsterdam', 'watchlist' from public.watchlist
    union all select user_id, added_at at time zone 'Europe/Amsterdam', 'persoon' from public.favorite_people
    union all select user_id, added_at at time zone 'Europe/Amsterdam', 'persoon' from public.favorite_directors
    union all select added_by, added_at at time zone 'Europe/Amsterdam', 'samen' from public.couple_watchlist where added_by is not null
    union all select rated_by, created_at at time zone 'Europe/Amsterdam', 'samen' from public.couple_ratings
    -- API-aanroepen (de app gebruiken zonder iets op te slaan); bewaard tot ongeveer een dag terug.
    union all select user_id, window_start at time zone 'Europe/Amsterdam', 'gebruik' from public.rate_limits
  ),
  today as (select (now() at time zone 'Europe/Amsterdam')::date as d),
  days as (
    select generate_series((select d from today) - 13, (select d from today), interval '1 day')::date as dag
  ),
  per_day as (
    select d.dag,
      (select count(*) from auth.users u where (u.created_at at time zone 'Europe/Amsterdam')::date = d.dag) as nieuw,
      (select count(distinct e.user_id) from events e where e.at_local::date = d.dag) as actief,
      (select count(*) from events e where e.at_local::date = d.dag and e.kind = 'beoordeling') as beoordelingen,
      (select count(*) from events e where e.at_local::date = d.dag and e.kind = 'favoriet') as favorieten,
      (select count(*) from events e where e.at_local::date = d.dag and e.kind = 'watchlist') as watchlist,
      (select count(*) from events e where e.at_local::date = d.dag and e.kind = 'samen') as samen
    from days d
  ),
  per_user as (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
      (select count(*) from public.favorite_movies f where f.user_id = u.id) as favorieten,
      (select count(*) from public.ratings r where r.user_id = u.id) as beoordelingen,
      (select count(*) from public.watchlist w where w.user_id = u.id) as watchlist,
      (select max(e.at_local) from events e where e.user_id = u.id) as laatst_actief,
      (select count(distinct e.at_local::date) from events e where e.user_id = u.id and e.at_local::date >= (select d from today) - 6) as actieve_dagen_7,
      coalesce(array_length(p.streaming_services, 1), 0) as diensten,
      p.onboarding_completed_at is not null as wizard_af,
      exists (select 1 from public.partner_connections pc where pc.status = 'accepted' and (pc.requester_id = u.id or pc.partner_id = u.id)) as gekoppeld
    from auth.users u left join public.profiles p on p.id = u.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'accounts', (select count(*) from auth.users),
      'actief_vandaag', (select count(distinct user_id) from events where at_local::date = (select d from today)),
      'actief_7_dagen', (select count(distinct user_id) from events where at_local::date >= (select d from today) - 6),
      'gekoppelde_koppels', (select count(*) from public.partner_connections where status = 'accepted'),
      'onze_lijst', (select count(*) from public.couple_watchlist),
      'samen_beoordelingen', (select count(*) from public.couple_ratings),
      'datenights_lopend', (select count(*) from public.couple_datenights)
    ),
    'days', (select coalesce(jsonb_agg(to_jsonb(p) order by p.dag), '[]'::jsonb) from per_day p),
    'users', (select coalesce(jsonb_agg(to_jsonb(u) order by u.laatst_actief desc nulls last), '[]'::jsonb) from per_user u)
  ) into result;

  return result;
end;
$$;

revoke all on function public.is_app_admin() from public, anon;
revoke all on function public.admin_usage_overview() from public, anon;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.admin_usage_overview() to authenticated;
