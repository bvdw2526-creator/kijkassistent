-- Bewaart de smaakmatch-score (percentage, gedeelde genres, verschillen) mee met het
-- opgeslagen Samen-resultaat, zodat die niet bij elke aanvraag opnieuw berekend wordt.
alter table public.couple_recommendations_cache add column if not exists match jsonb;
