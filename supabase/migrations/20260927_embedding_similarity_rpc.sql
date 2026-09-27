-- Verhaal-overeenkomst (Voyage-embeddings) liet de app tot nu toe voor élke titel het complete
-- smaakprofiel (1024 getallen, ~7 KB) naar de server halen om zelf te vergelijken. Bij het
-- vernieuwen van de aanbevelingen gebeurt dat voor honderden titels tegelijk, en dat bleek de
-- reden dat "op kijklijst zetten" er tijdens het vernieuwen soms 20-30 seconden over deed: alle
-- verzoeken (ook heel andere, zoals een simpele kijklijst-toevoeging) moesten in de rij wachten
-- omdat de database het gewicht van al dat dataverkeer niet aankon.
--
-- Met pgvector kan de vergelijking zelf in de database gebeuren: alleen titel-id's gaan erheen,
-- alleen een paar matchgetallen komen terug. Gemeten op de echte data: één aanvraag met scores
-- voor 400 titels duurt 428ms, tegen 17-30 seconden voor de oude aanpak (volledige profielen,
-- meerdere tegelijk).
create extension if not exists vector;

-- De kolom stond als jsonb (leesbaar, maar 5-10x groter dan nodig en niet vergelijkbaar in de
-- database zelf). Omzetten naar een echt vector-type; de waarden blijven identiek (geverifieerd:
-- dezelfde cosinus-overeenkomst, op de zesde decimaal na — het verschil komt puur doordat
-- pgvector intern met iets minder precisie rekent dan jsonb-tekst). Idempotent: doet niets meer
-- als de kolom al een vector is (bv. bij het opnieuw doorlopen van deze migratie).
do $$
begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'title_embeddings' and column_name = 'embedding') = 'jsonb' then
    alter table public.title_embeddings add column embedding_vec vector(1024);
    update public.title_embeddings set embedding_vec = (embedding::text)::vector;
    alter table public.title_embeddings drop column embedding;
    alter table public.title_embeddings rename column embedding_vec to embedding;
    alter table public.title_embeddings alter column embedding set not null;
  end if;
end $$;

-- p_vectors: één of meer smaakprofielen (bv. [jouwSmaak] of [smaakA, smaakB] bij Samen).
-- p_candidates: de titels om te vergelijken, als [{"media_type":"movie","tmdb_id":123}, ...].
-- Resultaat: per titel een array met een score (0-1) per meegegeven profiel, in dezelfde volgorde.
create or replace function public.embedding_similarities(
  p_vectors jsonb,
  p_candidates jsonb
)
returns table(media_type text, tmdb_id integer, similarities double precision[])
language sql
stable
security invoker
set search_path = ''
as $$
  with qv as (
    select ord, (v::text)::public.vector as vec
    from jsonb_array_elements(p_vectors) with ordinality as t(v, ord)
  ),
  cand as (
    select (c->>'media_type') as media_type, (c->>'tmdb_id')::integer as tmdb_id
    from jsonb_array_elements(p_candidates) c
  )
  select te.media_type, te.tmdb_id,
         array_agg(1 - (te.embedding OPERATOR(public.<=>) qv.vec) order by qv.ord) as similarities
  from public.title_embeddings te
  join cand on cand.media_type = te.media_type and cand.tmdb_id = te.tmdb_id
  cross join qv
  group by te.media_type, te.tmdb_id;
$$;

grant execute on function public.embedding_similarities(jsonb, jsonb) to anon, authenticated;
