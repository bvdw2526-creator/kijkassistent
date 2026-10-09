-- Smaaktoets: verhaal-vingerafdrukken. Draaien in de SQL-editor van Supabase (of via Claude met de database-koppeling).
-- Voor de profielen met meer dan 200 beoordelingen: voor elke beoordeelde titel (steeds de titel zelf weggelaten) hoe goed
-- de vingerafdrukken "zeker leuk" (inclusief favorieten) onderscheiden van "oké" en "niet voor mij". Uitkomst = trefkans in
-- procenten (50 = gokken). Twee maten: de dichtstbijzijnde titel die je leuk vond (verhaal-buren) en de tegenstelling (lijkt
-- meer op het gemiddelde van wat je leuk vond dan op dat van wat je afkeurde). Vergelijkt de Nederlandse (title_embeddings)
-- en de Engelse (title_embeddings_en) vingerafdrukken op precies dezelfde titels.
-- Nulmeting 9 okt 2026 (bevroren versie smaak-2026-10-09): zie docs/bevroren-versies.md.
with users as (select user_id from ratings group by user_id having count(*) > 200),
items as (
  select r.user_id, r.media_type, r.tmdb_id, r.rating as label from ratings r join users u using (user_id)
  where not exists (select 1 from favorite_movies f where f.user_id=r.user_id and f.tmdb_id=r.tmdb_id and f.media_type=r.media_type)
  union all
  select f.user_id, f.media_type, f.tmdb_id, 'love' from favorite_movies f join users u using (user_id)
),
emb as (
  select i.*, 'nl' versie, e.embedding from items i join title_embeddings e using (media_type, tmdb_id)
  where exists (select 1 from title_embeddings_en x where x.media_type=i.media_type and x.tmdb_id=i.tmdb_id)
  union all
  select i.*, 'en', e.embedding from items i join title_embeddings_en e using (media_type, tmdb_id)
  where exists (select 1 from title_embeddings x where x.media_type=i.media_type and x.tmdb_id=i.tmdb_id)
),
cl as (select user_id, versie, sum(embedding) s from emb where label='love' group by 1,2),
cd as (select user_id, versie, sum(embedding) s from emb where label='dislike' group by 1,2),
scored as (
  select e.user_id, e.versie, e.label,
    (select max(1 - (o.embedding <=> e.embedding)) from emb o
      where o.user_id=e.user_id and o.versie=e.versie and o.label='love' and not (o.tmdb_id=e.tmdb_id and o.media_type=e.media_type)) nn,
    (1 - (case when e.label='love' then cl.s - e.embedding else cl.s end <=> e.embedding))
      - (1 - (case when e.label='dislike' then cd.s - e.embedding else cd.s end <=> e.embedding)) tegenst
  from emb e join cl using (user_id, versie) join cd using (user_id, versie)
),
feat as (select user_id, versie, label, f, v from scored cross join lateral (values ('dichtstbijzijnde leuke', nn), ('tegenstelling', tegenst)) t(f, v)),
pairs as (
  select a.user_id, a.versie, a.f, a.label la, b.label lb, avg(case when a.v > b.v then 1.0 when a.v = b.v then 0.5 else 0 end) auc
  from feat a join feat b on a.user_id=b.user_id and a.versie=b.versie and a.f=b.f
  where (a.label,b.label) in (('love','dislike'),('love','ok'),('ok','dislike'))
  group by 1,2,3,4,5
)
select left(user_id::text,8) profiel, f maat, versie,
  round(100*max(auc) filter (where la='love' and lb='dislike'),1) leuk_vs_niet,
  round(100*max(auc) filter (where la='love' and lb='ok'),1) leuk_vs_oke,
  round(100*max(auc) filter (where la='ok' and lb='dislike'),1) oke_vs_niet
from pairs group by 1,2,3 order by 1,2,3 desc;
