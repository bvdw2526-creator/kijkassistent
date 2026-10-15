-- Gedeelde caches alleen nog door de server laten schrijven. Tot nu toe mocht elke ingelogde gebruiker (en iedereen kan zich
-- aanmelden) de TMDB-caches lezen, aanvullen, aanpassen en wissen, en verhaal-vingerafdrukken toevoegen. Daarmee kon iemand
-- bijvoorbeeld titels in de "lijkt hierop"-lijsten van iedereen zetten, de kijkinformatie vervalsen of een valse
-- vingerafdruk opslaan. De database kan niet controleren of een rij echt van TMDB of Voyage komt, dus de enige oplossing is
-- dat alleen de server schrijft, met de service role-sleutel (zie lib/supabaseAdmin.ts; die gaat om deze regels heen).
--
-- PAS UITVOEREN als de versie met lib/supabaseAdmin.ts live staat en SUPABASE_SERVICE_ROLE_KEY in Vercel is ingesteld.
-- Anders kunnen de caches niet meer worden aangevuld (de app blijft wel werken, maar haalt dan alles telkens live op).
--
-- Lezen blijft precies zoals het was. Dit is een bewuste uitzondering op "database alleen toevoegen" (docs/bevroren-versies.md):
-- er wordt iets weggehaald, omdat het om beveiliging gaat. De bevroren versie smaak-2026-10-09 blijft werken met de gegevens die
-- er zijn; alleen kan die oude code zelf geen nieuwe rijen meer opslaan.

-- TMDB-caches: "authenticated read/write" (alles) vervangen door alleen lezen voor ingelogde gebruikers.
drop policy if exists "authenticated read/write" on public.tmdb_collection_cache;
drop policy if exists "authenticated read/write" on public.tmdb_credits_cache;
drop policy if exists "authenticated read/write" on public.tmdb_details_cache;
drop policy if exists "authenticated read/write" on public.tmdb_discover_cache;
drop policy if exists "authenticated read/write" on public.tmdb_features_cache;
drop policy if exists "authenticated read/write" on public.tmdb_recommendations_cache;
drop policy if exists "authenticated read/write" on public.tmdb_watch_providers_cache;

create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_collection_cache for select to authenticated using (true);
create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_credits_cache for select to authenticated using (true);
create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_details_cache for select to authenticated using (true);
create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_discover_cache for select to authenticated using (true);
create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_features_cache for select to authenticated using (true);
create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_recommendations_cache for select to authenticated using (true);
create policy "Ingelogde gebruikers mogen lezen" on public.tmdb_watch_providers_cache for select to authenticated using (true);

-- Verhaal-vingerafdrukken: toevoegen niet meer voor gebruikers; lezen blijft voor iedereen.
drop policy if exists "Ingelogde gebruikers mogen embeddings toevoegen" on public.title_embeddings;
drop policy if exists "Ingelogde gebruikers mogen Engelse embeddings toevoegen" on public.title_embeddings_en;

-- De oude Watchmode-cache wordt niet meer gebruikt: alleen nog lezen.
drop policy if exists "Ingelogde gebruikers mogen cache aanvullen" on public.watchmode_cache;
drop policy if exists "Ingelogde gebruikers mogen cache bijwerken" on public.watchmode_cache;
