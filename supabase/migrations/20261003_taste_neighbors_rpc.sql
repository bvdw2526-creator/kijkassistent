-- "Niet voor mij" via de verhaal-embeddings: voor elke kandidaat de k dichtstbijzijnde titels uit iemands
-- smaakset (favorieten/"zeker leuk" = love, afgekeurd = dislike), met de overeenkomst per buur. De motor
-- (lib/recommendationEngine.ts) rekent daar een straf uit als de naaste buren vooral afgekeurd zijn.
-- Gemeten op echte data: 42% van iemands afgekeurde films heeft 2+ afgekeurde films onder de 5 buren,
-- tegen 17% bij films die diegene leuk vindt. Alleen titel-id's gaan erheen, alleen een paar getallen terug.
-- De smaakset wordt één keer ingelezen (materialized): zo is dit ~3x sneller dan per kandidaat opnieuw
-- (250 kandidaten x 110 titels in ~0,3 s).
create or replace function public.embedding_taste_neighbors(
  p_candidates jsonb,   -- [{"media_type":"movie","tmdb_id":123}, ...]
  p_rated jsonb,        -- [{"media_type":"movie","tmdb_id":456,"verdict":"love"|"dislike"}, ...]
  p_k integer default 5
)
returns table(media_type text, tmdb_id integer, neighbors jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with rated as materialized (
    select (r->>'verdict') as verdict, te.embedding as emb
    from jsonb_array_elements(p_rated) r
    join public.title_embeddings te
      on te.media_type = (r->>'media_type') and te.tmdb_id = (r->>'tmdb_id')::integer
  ),
  cand as (
    select (c->>'media_type') as media_type, (c->>'tmdb_id')::integer as tmdb_id, te.embedding as emb
    from jsonb_array_elements(p_candidates) c
    join public.title_embeddings te
      on te.media_type = (c->>'media_type') and te.tmdb_id = (c->>'tmdb_id')::integer
  ),
  sims as (
    select cand.media_type, cand.tmdb_id, r.verdict,
           1 - (r.emb OPERATOR(public.<=>) cand.emb) as sim,
           row_number() over (partition by cand.media_type, cand.tmdb_id order by r.emb OPERATOR(public.<=>) cand.emb) as rn
    from cand cross join rated r
  )
  select s.media_type, s.tmdb_id,
         jsonb_agg(jsonb_build_object('v', s.verdict, 's', s.sim) order by s.sim desc) as neighbors
  from sims s
  where s.rn <= p_k
  group by s.media_type, s.tmdb_id;
$$;

grant execute on function public.embedding_taste_neighbors(jsonb, jsonb, integer) to anon, authenticated;
