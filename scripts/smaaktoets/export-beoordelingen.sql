-- Voor de kenmerken-toets (toets-kenmerken.ts): de beoordeelde titels van de profielen met meer dan 200 beoordelingen, zonder
-- namen of id's van gebruikers. Plak de uitkomst (één JSON-object) in scripts/smaaktoets/data/rated.json. Die map staat in
-- .gitignore: beoordelingen van gebruikers horen niet in het (openbare) project.
-- Per titel: m/t (film/serie) + TMDB-id + oordeel (F favoriet, L zeker leuk, O oké, D niet voor mij).
with users as (select user_id, row_number() over (order by count(*) desc) nr from ratings group by user_id having count(*) > 200),
items as (
  select r.user_id, r.media_type, r.tmdb_id, case r.rating when 'love' then 'L' when 'ok' then 'O' else 'D' end lab, r.rated_at t
  from ratings r join users using (user_id)
  where not exists (select 1 from favorite_movies f where f.user_id=r.user_id and f.tmdb_id=r.tmdb_id and f.media_type=r.media_type)
  union all
  select f.user_id, f.media_type, f.tmdb_id, 'F', f.added_at from favorite_movies f join users using (user_id)
)
select json_object_agg('profiel-' || u.nr, x.items) as rated_json
from (select user_id, string_agg(left(media_type,1) || tmdb_id || lab, ',' order by t) items from items group by user_id) x
join users u using (user_id);
