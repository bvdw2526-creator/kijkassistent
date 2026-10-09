-- Smaaktoets: Samen. Voor elk stel met samen beoordeelde titels (couple_ratings): hoe goed de verhaal-score van Samen de
-- titels die jullie "zeker leuk" of "oké" vonden boven de "niet voor mij" zet (steeds de titel zelf weggelaten). "huidig" is
-- de berekening van applyJointFit (per persoon de tegenstelling, gestandaardiseerd, de zwakste van beiden, min de helft van
-- "lijkt op wat jullie samen afkeurden"); "oud" is de zwakste van de twee ruwe overeenkomsten. Ook per persoon apart, om te
-- zien wiens smaak de uitkomst bepaalt. Gebruikt de Engelse vingerafdrukken (title_embeddings_en).
-- Let op: tot nu toe één stel met 14 titels, dus een aanwijzing, geen bewijs.
with conn as (select id, requester_id a, partner_id b from partner_connections where status='accepted'),
cr as (select cr.connection_id, cr.media_type, cr.tmdb_id, cr.rating, e.embedding from couple_ratings cr join title_embeddings_en e using (media_type, tmdb_id)),
likes as (
  select f.user_id, f.media_type, f.tmdb_id, e.embedding from favorite_movies f join title_embeddings_en e using (media_type, tmdb_id)
  union all select r.user_id, r.media_type, r.tmdb_id, e.embedding from ratings r join title_embeddings_en e using (media_type, tmdb_id) where r.rating='love'
),
dis as (select r.user_id, r.media_type, r.tmdb_id, e.embedding from ratings r join title_embeddings_en e using (media_type, tmdb_id) where r.rating='dislike'),
s as (
  select t.connection_id, t.rating,
    1 - ((select sum(l.embedding) from likes l where l.user_id=c.a and not (l.media_type=t.media_type and l.tmdb_id=t.tmdb_id)) <=> t.embedding) a_like,
    1 - ((select sum(l.embedding) from dis l where l.user_id=c.a and not (l.media_type=t.media_type and l.tmdb_id=t.tmdb_id)) <=> t.embedding) a_dis,
    (select count(*) from dis l where l.user_id=c.a and not (l.media_type=t.media_type and l.tmdb_id=t.tmdb_id)) a_ndis,
    1 - ((select sum(l.embedding) from likes l where l.user_id=c.b and not (l.media_type=t.media_type and l.tmdb_id=t.tmdb_id)) <=> t.embedding) b_like,
    1 - ((select sum(l.embedding) from dis l where l.user_id=c.b and not (l.media_type=t.media_type and l.tmdb_id=t.tmdb_id)) <=> t.embedding) b_dis,
    (select count(*) from dis l where l.user_id=c.b and not (l.media_type=t.media_type and l.tmdb_id=t.tmdb_id)) b_ndis,
    1 - ((select sum(o.embedding) from cr o where o.connection_id=t.connection_id and o.rating='dislike' and not (o.media_type=t.media_type and o.tmdb_id=t.tmdb_id)) <=> t.embedding) c_dis
  from cr t join conn c on c.id=t.connection_id
),
r as (select *, a_like - case when a_ndis >= 3 then a_dis else 0 end ra, b_like - case when b_ndis >= 3 then b_dis else 0 end rb from s),
st as (
  select connection_id,
    percentile_cont(0.5) within group (order by ra) ma, percentile_cont(0.75) within group (order by ra) - percentile_cont(0.25) within group (order by ra) ia,
    percentile_cont(0.5) within group (order by rb) mb, percentile_cont(0.75) within group (order by rb) - percentile_cont(0.25) within group (order by rb) ib,
    percentile_cont(0.5) within group (order by c_dis) mc, percentile_cont(0.75) within group (order by c_dis) - percentile_cont(0.25) within group (order by c_dis) ic
  from r group by 1
),
z as (
  select r.connection_id, r.rating, least(r.a_like, r.b_like) oud,
    least((r.ra - st.ma)/nullif(st.ia,0), (r.rb - st.mb)/nullif(st.ib,0)) - 0.5 * coalesce((r.c_dis - st.mc)/nullif(st.ic,0), 0) huidig,
    r.a_like persoon_a, r.b_like persoon_b
  from r join st using (connection_id)
),
f as (select connection_id, rating, v.k, v.val from z cross join lateral (values
  ('huidig', huidig), ('oud (zwakste van beiden)', oud), ('alleen persoon a', persoon_a), ('alleen persoon b', persoon_b)) v(k, val))
select left(x.connection_id::text,4) stel, x.k maat, count(*) paren,
  round(100*avg(case when x.val > y.val then 1.0 when x.val = y.val then 0.5 else 0 end),0) trefkans
from f x join f y on x.connection_id=y.connection_id and x.k=y.k
where x.rating in ('love','ok') and y.rating='dislike' group by 1,2 order by 1,2;
