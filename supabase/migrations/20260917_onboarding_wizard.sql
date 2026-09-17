-- Volgorde van stappen wordt niet apart opgeslagen (zie onboarding_started_at hieronder) —
-- die wordt steeds afgeleid van de echte data (streaming_services/favorite_movies), zodat
-- niets uit sync kan raken. Twee kolommen zijn wel nodig:
--   - onboarding_completed_at: NULL zolang de wizard nog niet is afgerond. Bepaalt of
--     app/page.tsx bij het inloggen naar /wizard doorstuurt.
--   - onboarding_started_at: het moment waarop iemand de wizard voor het eerst te zien
--     kreeg. Na 5 dagen zonder afronden stoppen we met dwingend doorsturen (zie
--     app/page.tsx) — iemand kan de app dan gewoon gebruiken, met een niet-opdringerige
--     "maak je profiel af"-melding in Instellingen.
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_started_at timestamptz;

-- Bestaande gebruikers hebben de wizard nooit gezien en zijn geen "nieuwe" gebruikers —
-- zonder deze backfill zouden zij bij hun volgende login allemaal de wizard te zien
-- krijgen. Markeer ze dus als al voltooid.
update public.profiles set onboarding_completed_at = now() where onboarding_completed_at is null;
