-- Slot voor de Samen-berekening: wie de lijst op de achtergrond aan het samenstellen is, zet hier
-- het tijdstip, zodat de ander (of een tweede aanvraag) niet tegelijk hetzelfde nog eens doet.
alter table public.couple_recommendations_cache add column if not exists computing_since timestamptz;
