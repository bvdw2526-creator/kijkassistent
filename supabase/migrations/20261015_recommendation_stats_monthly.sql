-- Anonieme maandtotalen van recommendation_events, zodat de trend blijft bestaan als de details na 18 maanden weg zijn
-- (en als iemand zijn account verwijdert). Per maand, tabblad, titel en plek in de lijst: hoe vaak getoond, geopend,
-- gekozen, raak, oké, niet voor mij en afgehaakt. Er zit geen gebruiker in.
--
-- summarize_recommendation_events() rekent alle maanden waarvan nog details zijn opnieuw uit (uitkomsten kunnen later
-- binnenkomen) en verwijdert daarna de details van vóór de grens van 18 maanden, altijd per hele maand. Een maand
-- waarvan de details weg zijn, blijft in de totalen staan zoals hij was. De functie draait bij het verversen van het
-- beheer-dashboard (zie docs/trefkans.md); er is geen pg_cron.
create table if not exists public.recommendation_stats_monthly (
  month date not null,
  screen text not null check (screen in ('voor_jou', 'kijklijst', 'onze_lijst')),
  mode text,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  -- '1–4', '5–10', '11–20' of '21+' (alleen bij Voor jou).
  plek text,
  getoond integer not null default 0,
  geopend integer not null default 0,
  -- Na het tonen op een lijst gezet, beoordeeld of favoriet gemaakt.
  gekozen integer not null default 0,
  -- Zeker leuk of favoriet; oké en niet voor mij apart.
  raak integer not null default 0,
  oke integer not null default 0,
  niet integer not null default 0,
  afgehaakt integer not null default 0,
  -- Opgeteld over de afgehaakte titels; gemiddelde = dagen_op_lijst / afgehaakt.
  dagen_op_lijst integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists recommendation_stats_monthly_key
  on public.recommendation_stats_monthly (month, screen, mode, media_type, tmdb_id, plek) nulls not distinct;

alter table public.recommendation_stats_monthly enable row level security;

create policy "Beheerder mag maandtotalen lezen" on public.recommendation_stats_monthly
  for select using (public.is_app_admin());

comment on table public.recommendation_stats_monthly is 'Anonieme maandtotalen van recommendation_events (zonder gebruiker); blijven bewaard na het opruimen van de details.';

create or replace function public.summarize_recommendation_events()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Details van vóór deze maand gaan weg (18 maanden, per hele maand, Amsterdamse tijd).
  boundary date := (date_trunc('month', now() at time zone 'Europe/Amsterdam') - interval '18 months')::date;
begin
  delete from public.recommendation_stats_monthly
    where month in (select distinct date_trunc('month', day)::date from public.recommendation_events);

  insert into public.recommendation_stats_monthly (month, screen, mode, media_type, tmdb_id, plek, getoond, geopend, gekozen, raak, oke, niet)
  with shown as (
    select user_id, mode, media_type, tmdb_id, min(created_at) first_at, min(day) first_day, min(position) pos
    from public.recommendation_events
    where event = 'getoond' and screen = 'voor_jou'
    group by 1, 2, 3, 4
  ), opened as (
    select distinct user_id, mode, media_type, tmdb_id
    from public.recommendation_events
    where event = 'geopend' and screen = 'voor_jou'
  ), outcome as (
    select user_id, media_type, tmdb_id, 'fav' uitkomst, added_at at time zone 'UTC' t from public.favorite_movies where source_info is not null
    union all select user_id, media_type, tmdb_id, rating, rated_at at time zone 'UTC' from public.ratings where source_info is not null
    union all select user_id, media_type, tmdb_id, 'lijst', added_at at time zone 'UTC' from public.watchlist where source_info is not null
    union all select added_by, media_type, tmdb_id, 'lijst', added_at from public.couple_watchlist where source_info is not null and added_by is not null
  ), joined as (
    select s.mode, s.media_type, s.tmdb_id, s.first_day, s.pos,
      (o.user_id is not null) is_opened,
      coalesce(bool_or(x.uitkomst is not null), false) gekozen,
      coalesce(bool_or(x.uitkomst in ('fav', 'love')), false) raak,
      coalesce(bool_or(x.uitkomst = 'ok'), false) oke,
      coalesce(bool_or(x.uitkomst = 'dislike'), false) niet
    from shown s
    left join opened o using (user_id, mode, media_type, tmdb_id)
    left join outcome x on x.user_id = s.user_id and x.media_type = s.media_type and x.tmdb_id = s.tmdb_id
      and x.t >= s.first_at - interval '1 minute'
    group by s.user_id, s.mode, s.media_type, s.tmdb_id, s.first_day, s.pos, o.user_id
  )
  select date_trunc('month', first_day)::date, 'voor_jou', mode, media_type, tmdb_id,
    case when pos is null then null when pos <= 4 then '1–4' when pos <= 10 then '5–10' when pos <= 20 then '11–20' else '21+' end,
    count(*),
    count(*) filter (where is_opened),
    count(*) filter (where gekozen),
    count(*) filter (where raak),
    count(*) filter (where oke and not raak),
    count(*) filter (where niet and not raak and not oke)
  from joined
  group by 1, 2, 3, 4, 5, 6;

  insert into public.recommendation_stats_monthly (month, screen, mode, media_type, tmdb_id, plek, afgehaakt, dagen_op_lijst)
  select date_trunc('month', day)::date, screen, mode, media_type, tmdb_id, null, count(*), coalesce(sum(days_on_list), 0)
  from public.recommendation_events
  where event = 'afgehaakt'
  group by 1, 2, 3, 4, 5;

  delete from public.recommendation_events where day < boundary;
end;
$$;

revoke execute on function public.summarize_recommendation_events() from public, anon, authenticated;
