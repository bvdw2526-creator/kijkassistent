-- Snellere versies van embedding_similarities_en en embedding_taste_neighbors_en, met dezelfde uitkomst. De oude functies
-- blijven staan (zie docs/bevroren-versies.md: database alleen toevoegen); de motor wijst naar deze via SIMILARITY_RPC en
-- NEIGHBORS_RPC in lib/recommendationEngine.ts.
--
-- Gemeten op 13 okt 2026: de verhaal-vergelijking kostte gemiddeld 450-900 ms per portie van 200 titels en de buren 0,4-1,9 s
-- per portie van 250, samen ongeveer de helft van een berekening. De sommen zelf zijn licht; de tijd zat in omwegen:
--  - embedding_similarities_en zette de smaakvector (tekst van 1.024 getallen) voor elke titel opnieuw om, en sorteerde alle
--    combinaties van titel en vector inclusief de vectoren zelf (6 MB, op schijf) om ze per titel te groeperen;
--  - embedding_taste_neighbors_en haalde voor elk van de 75.000 paren (250 kandidaten maal 300 beoordeelde titels) beide
--    vingerafdrukken opnieuw uit de opslag.
-- Proef op dezelfde invoer: 475 ms -> 6 ms en 1.900 ms -> 150 ms.

-- Vergelijkt titels met één of meer smaakvectoren. Verschil met embedding_similarities_en: de vectoren worden één keer
-- omgezet (materialized), en per titel worden de overeenkomsten direct uitgerekend in plaats van via sorteren en groeperen.
-- Een titel die twee keer in p_candidates staat komt er één keer uit (distinct); de oude functie gaf dan één rij met de
-- getallen dubbel.
create or replace function public.embedding_similarities_en_v2(
  p_vectors jsonb,
  p_candidates jsonb
)
returns table(media_type text, tmdb_id integer, similarities double precision[])
language sql
stable
security invoker
set search_path = ''
as $$
  with qv as materialized (
    select ord, (v::text)::public.vector as vec
    from jsonb_array_elements(p_vectors) with ordinality as t(v, ord)
  ),
  cand as (
    select distinct (c->>'media_type') as media_type, (c->>'tmdb_id')::integer as tmdb_id
    from jsonb_array_elements(p_candidates) c
  )
  select te.media_type, te.tmdb_id,
         (select array_agg(1 - (te.embedding OPERATOR(public.<=>) qv.vec) order by qv.ord) from qv) as similarities
  from public.title_embeddings_en te
  join cand on cand.media_type = te.media_type and cand.tmdb_id = te.tmdb_id
  -- Zonder vectoren gaf de oude functie niets terug.
  where exists (select 1 from qv);
$$;

-- Per kandidaat de p_k dichtstbijzijnde titels uit iemands smaakset. Verschil met embedding_taste_neighbors_en: de
-- vingerafdrukken worden één keer uit de opslag gehaald (de omweg via real[] maakt er een kopie in het geheugen van, met
-- exact dezelfde getallen), en per kandidaat worden direct de dichtstbijzijnde gekozen in plaats van alle paren in één keer
-- te sorteren. Bij precies gelijke afstand telt de volgorde in p_rated; de oude functie koos dan willekeurig.
create or replace function public.embedding_taste_neighbors_en_v2(
  p_candidates jsonb,
  p_rated jsonb,
  p_k integer default 5
)
returns table(media_type text, tmdb_id integer, neighbors jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with rated as materialized (
    select r.ord, (r.value->>'verdict') as verdict, (te.embedding::real[])::public.vector as emb
    from jsonb_array_elements(p_rated) with ordinality as r(value, ord)
    join public.title_embeddings_en te
      on te.media_type = (r.value->>'media_type') and te.tmdb_id = (r.value->>'tmdb_id')::integer
  ),
  cand as materialized (
    select c.media_type, c.tmdb_id, (te.embedding::real[])::public.vector as emb
    from (
      select distinct (c.value->>'media_type') as media_type, (c.value->>'tmdb_id')::integer as tmdb_id
      from jsonb_array_elements(p_candidates) c
    ) c
    join public.title_embeddings_en te
      on te.media_type = c.media_type and te.tmdb_id = c.tmdb_id
  )
  select c.media_type, c.tmdb_id, n.neighbors
  from cand c
  cross join lateral (
    select jsonb_agg(jsonb_build_object('v', x.verdict, 's', 1 - x.dist) order by x.dist, x.ord) as neighbors
    from (
      select r.verdict, r.ord, (r.emb OPERATOR(public.<=>) c.emb) as dist
      from rated r
      order by 3, r.ord
      limit p_k
    ) x
  ) n
  -- Zonder beoordeelde titels gaf de oude functie niets terug.
  where n.neighbors is not null;
$$;

-- Zelfde rechten als de oude functies.
grant execute on function public.embedding_similarities_en_v2(jsonb, jsonb) to anon, authenticated;
grant execute on function public.embedding_taste_neighbors_en_v2(jsonb, jsonb, integer) to anon, authenticated;
