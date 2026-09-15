-- shown_recommendations (user_id, tmdb_id, media_type, shown_at) werd nergens meer in de
-- app-code gebruikt en stond ook in geen enkele eerdere migratie hier — waarschijnlijk
-- een restant van een idee dat nooit is afgebouwd. Opgeruimd na controle dat er geen
-- referenties naar zijn in de codebase.
drop table if exists public.shown_recommendations;
