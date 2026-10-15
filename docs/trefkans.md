# Trefkans: van tonen tot raak

Sinds 15 oktober 2026 legt de app in `recommendation_events` vast wat er rond een aanbeveling gebeurt vóór een oordeel
(migratie `supabase/migrations/20261015_recommendation_events.sql`, code in `lib/recommendationEvents.ts`):

- **getoond**: een kaart op Voor jou was minstens een seconde voor de helft in beeld (één keer per titel, tabblad en dag).
- **geopend**: iemand tikte op de kaart op Voor jou.
- **afgehaakt**: iemand haalde een titel zonder oordeel van de kijklijst of Onze lijst (met `days_on_list`).

Wat iemand daarna kiest, staat al in `source_info` bij `ratings`, `favorite_movies`, `watchlist` en `couple_watchlist`
(zie `20261008_recommendation_outcome.sql`). Samen geven ze de trechter:

| Stap | Betekenis |
|---|---|
| Getoond | unieke titels per gebruiker en tabblad |
| Geopend | daarvan ook geopend |
| Gekozen | daarna op een lijst gezet, beoordeeld of favoriet gemaakt (met `source_info`) |
| Raak | daarna "zeker leuk" of favoriet (oké en niet voor mij apart) |

## Anonieme maandtotalen

De details bewaren we 18 maanden. Voor de lange termijn is er `recommendation_stats_monthly`
(`20261015_recommendation_stats_monthly.sql`): per maand, scherm, tabblad, titel en plek in de lijst de aantallen getoond,
geopend, gekozen, raak, oké, niet voor mij en afgehaakt, zonder gebruiker. Die blijven staan als de details weg zijn of
als iemand zijn account verwijdert.

`summarize_recommendation_events()` rekent alle maanden met details opnieuw uit (uitkomsten kunnen later komen) en
verwijdert daarna de details van vóór de grens van 18 maanden, per hele maand. Er is geen pg_cron: de functie draait bij
elk verversen van het beheer-dashboard. Alleen de database-beheerder kan hem aanroepen.

## Telling voor het beheer-dashboard (veld `trechter`)

Halloween-tabbladen (`halloween`, `halloween-samen`) staan wel in de totalen, maar tellen hier niet mee.

```sql
select public.summarize_recommendation_events();

with m as (select * from recommendation_stats_monthly where screen = 'voor_jou' and mode in ('focused','balanced','explore','samen')),
agg as (select coalesce(sum(getoond),0) getoond, coalesce(sum(geopend),0) geopend, coalesce(sum(gekozen),0) gekozen, coalesce(sum(raak),0) raak, coalesce(sum(oke),0) oke, coalesce(sum(niet),0) niet from m)
select json_build_object(
  'since', (select min(month) from recommendation_stats_monthly),
  'users', (select count(distinct user_id) from recommendation_events where event = 'getoond'),
  'total', (select row_to_json(agg) from agg),
  'mode', (select coalesce(json_object_agg(mode, v), '{}') from (select mode, json_build_object('getoond', sum(getoond), 'geopend', sum(geopend), 'gekozen', sum(gekozen), 'raak', sum(raak), 'oke', sum(oke), 'niet', sum(niet)) v from m group by mode) x),
  'plek', (select coalesce(json_agg(v order by o), '[]') from (select min(case plek when '1–4' then 1 when '5–10' then 2 when '11–20' then 3 else 4 end) o, json_build_object('plek', plek, 'getoond', sum(getoond), 'geopend', sum(geopend), 'gekozen', sum(gekozen), 'raak', sum(raak), 'oke', sum(oke), 'niet', sum(niet)) v from m group by plek) p),
  'afgehaakt', (select json_build_object('n', coalesce(sum(afgehaakt),0), 'gemDagen', case when sum(afgehaakt) > 0 then round(sum(dagen_op_lijst)::numeric / sum(afgehaakt)) end) from recommendation_stats_monthly where screen in ('kijklijst','onze_lijst')),
  'lijstGekeken', (select count(*) from ratings where source_info->>'via' is not null and rated_at > (select coalesce(min(month)::timestamp, now() at time zone 'UTC') from recommendation_stats_monthly)),
  'maanden', (select coalesce(json_agg(v order by month), '[]') from (select month, json_build_object('maand', month, 'getoond', sum(getoond), 'raak', sum(raak)) v from m group by month) mm)
) trechter;
```

`users` komt uit de details en telt dus alleen de laatste 18 maanden.
