-- Bewaart bij het toevoegen aan de watchlist waar de titel toen te zien was en uit
-- welke aanbevelingsmodus hij kwam, zodat de watchlist-pagina dat achteraf kan tonen
-- (streamingdiensten/beschikbaarheid kunnen intussen wijzigen, dus dit is een
-- momentopname van het moment van toevoegen, geen live status).
alter table watchlist add column if not exists watch_on text;
alter table watchlist add column if not exists watch_url text;
alter table watchlist add column if not exists source_mode text;
