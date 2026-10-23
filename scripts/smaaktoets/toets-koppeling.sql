-- Smaaktoets: de koppeling via TMDB's lijst "kijkers van X keken ook" (coreScore in lib/recommendationEngine.ts).
-- Draaien in de SQL-editor van Supabase (of via Claude met de database-koppeling). Leest alleen.
-- Voor de profielen met meer dan 200 beoordelingen: voor elke beoordeelde titel (steeds de titel zelf weggelaten) de
-- koppelingsscore uit de andere favorieten en "zeker leuk"-titels, net als in de app: favoriet 3, zeker leuk 2, elke
-- extra bron telt 0,75 keer de vorige. Uitkomst = trefkans in procenten (50 = gokken).
-- Toon-controle (TONE_MISMATCH_FACTOR): heeft de titel komedie (35) of romantiek (10749) en de bron geen van beide,
-- dan telt die bron maal de factor. Per regel een factor; 1 = zonder toon-controle (de oude berekening).
-- Gebruikt de bewaarde lijsten (tmdb_recommendations_cache, pagina 1 en 2) en genres (tmdb_details_cache).
with users as (select user_id from ratings group by user_id having count(*) > 200),
items as (
  select r.user_id, r.media_type, r.tmdb_id, r.rating as label from ratings r join users u using (user_id)
  where not exists (select 1 from favorite_movies f where f.user_id=r.user_id and f.tmdb_id=r.tmdb_id and f.media_type=r.media_type)
  union all
  select f.user_id, f.media_type, f.tmdb_id, 'fav' from favorite_movies f join users u using (user_id)
),
sources as (
  select i.user_id, i.media_type, i.tmdb_id, case when i.label='fav' then 3.0 else 2.0 end as w,
    exists (select 1 from jsonb_array_elements(d.genres::jsonb) g where (g->>'id')::int in (35, 10749)) as light
  from items i join tmdb_details_cache d using (media_type, tmdb_id)
  where i.label in ('fav', 'love')
),
-- Elke bron met de titels uit zijn lijst (een titel op beide pagina's telt één keer).
links as (
  select distinct s.user_id, s.media_type src_type, s.tmdb_id src_id, s.w, s.light,
    c.media_type, (e->>'id')::int tmdb_id,
    exists (select 1 from jsonb_array_elements_text(e->'genre_ids') g where g::int in (35, 10749)) as cand_light
  from sources s
  join tmdb_recommendations_cache c on c.media_type=s.media_type and c.tmdb_id=s.tmdb_id and c.page in (1, 2)
  cross join lateral jsonb_array_elements(c.results::jsonb) e
),
factors as (select unnest(array[1.0, 0.7, 0.5, 0.3, 0.0]) f),
hits as (
  select i.user_id, i.media_type, i.tmdb_id, i.label, fa.f,
    l.w * case when l.cand_light and not l.light then fa.f else 1 end as w
  from items i cross join factors fa
  join links l on l.user_id=i.user_id and l.media_type=i.media_type and l.tmdb_id=i.tmdb_id
    and not (l.src_type=i.media_type and l.src_id=i.tmdb_id)
),
ranked as (select *, row_number() over (partition by user_id, media_type, tmdb_id, f order by w desc) - 1 rn from hits),
scored as (
  select i.user_id, i.label, fa.f, coalesce(sum(r.w * power(0.75, r.rn)), 0) v
  from items i cross join factors fa
  left join ranked r on r.user_id=i.user_id and r.media_type=i.media_type and r.tmdb_id=i.tmdb_id and r.f=fa.f
  group by i.user_id, i.media_type, i.tmdb_id, i.label, fa.f
),
lab as (select user_id, case label when 'fav' then 'love' else label end label, f, v from scored),
pairs as (
  select a.user_id, a.f, a.label la, b.label lb, avg(case when a.v > b.v then 1.0 when a.v = b.v then 0.5 else 0 end) auc
  from lab a join lab b on a.user_id=b.user_id and a.f=b.f
  where (a.label, b.label) in (('love','dislike'),('love','ok'),('ok','dislike'))
  group by 1,2,3,4
)
-- licht_in_leuk = aandeel luchtige titels in favorieten + "zeker leuk"; de app past de controle alleen toe onder
-- LIGHT_TONE_MAX_SHARE (15%). Daarboven geldt in de app de regel met factor 1.
select left(user_id::text,8) profiel,
  (select round(100.0*avg(light::int),1) from sources s where s.user_id=pairs.user_id) licht_in_leuk,
  f factor,
  round(100*max(auc) filter (where la='love' and lb='dislike'),1) leuk_vs_niet,
  round(100*max(auc) filter (where la='love' and lb='ok'),1) leuk_vs_oke,
  round(100*max(auc) filter (where la='ok' and lb='dislike'),1) oke_vs_niet
from pairs group by pairs.user_id, f order by 1, 3 desc;
