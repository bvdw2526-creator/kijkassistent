-- Stemuitslag per titel: hoe anderen een film of serie beoordeelden ("zeker leuk", "was oké", "niet voor mij"), voor
-- in de infopopups (app/components/CommunityVotes.tsx). Een favoriet telt als "zeker leuk"; per persoon telt één stem
-- (zie 20261017_favorite_or_rating: favoriet en beoordeling staan nooit allebei).
--
-- Live berekend: per titel zijn het hooguit een paar honderd rijen en er komen indexen op titel bij, dus een aparte
-- tellertabel is (nog) niet nodig.
--
-- Privacy: de aantallen per soort stem komen alleen terug vanaf de drempel die de app meegeeft, en nooit onder de 5,
-- ook niet als iemand de functie zelf aanroept. Anders kun je bij een titel met twee stemmen raden wat je partner vond.
-- Onder de drempel komt alleen het totaal terug. my_vote is de stem van wie het vraagt (een favoriet als 'love').
--
-- Alleen toevoegen: een functie en twee indexen; bestaande tabellen blijven zoals ze zijn (zie docs/bevroren-versies.md).

create index if not exists ratings_title_idx on public.ratings (tmdb_id, media_type);
create index if not exists favorite_movies_title_idx on public.favorite_movies (tmdb_id, media_type);

create or replace function public.title_vote_summary(p_tmdb_id integer, p_media_type text, p_min integer default 20)
returns table (total integer, love integer, ok integer, dislike integer, my_vote text)
language sql
stable
security definer
set search_path = ''
as $$
  with votes as (
    select distinct on (v.user_id) v.user_id, v.vote
    from (
      select f.user_id, 'love'::text as vote, 0 as pref
      from public.favorite_movies f
      where f.tmdb_id = p_tmdb_id and f.media_type = p_media_type
      union all
      select r.user_id, r.rating, 1
      from public.ratings r
      where r.tmdb_id = p_tmdb_id and r.media_type = p_media_type and r.rating in ('love', 'ok', 'dislike')
    ) v
    order by v.user_id, v.pref
  ),
  agg as (
    select
      count(*)::integer as total,
      count(*) filter (where vote = 'love')::integer as love,
      count(*) filter (where vote = 'ok')::integer as ok,
      count(*) filter (where vote = 'dislike')::integer as dislike
    from votes
  )
  select
    a.total,
    case when a.total >= greatest(coalesce(p_min, 20), 5) then a.love end,
    case when a.total >= greatest(coalesce(p_min, 20), 5) then a.ok end,
    case when a.total >= greatest(coalesce(p_min, 20), 5) then a.dislike end,
    (select vote from votes where user_id = auth.uid())
  from agg a;
$$;

revoke all on function public.title_vote_summary(integer, text, integer) from public, anon;
grant execute on function public.title_vote_summary(integer, text, integer) to authenticated, service_role;

comment on function public.title_vote_summary(integer, text, integer) is 'Stemuitslag per titel (favoriet telt als zeker leuk); aantallen per soort alleen vanaf de drempel (minimaal 5), daaronder alleen het totaal.';
