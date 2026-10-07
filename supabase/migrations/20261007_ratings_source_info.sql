-- Bij een beoordeling vanaf Voor jou bewaren we in welk tabblad de titel stond, het percentage, de redenen ("aanbevolen
-- omdat…") en de scores op dat moment. Zo kunnen we achteraf uitleggen waarom een titel werd aanbevolen, bijvoorbeeld als
-- iemand "niet voor mij" zegt bij een titel uit Puur mijn smaak. Alleen voor de beheerder zichtbaar in het dashboard,
-- zonder e-mailadressen of namen. Beoordelingen via Zoeken of de kijklijst hebben hier geen waarde.
alter table public.ratings add column if not exists source_info jsonb;

comment on column public.ratings.source_info is 'Alleen bij beoordelingen vanaf Voor jou: tabblad, percentage, redenen en scores op het moment van beoordelen, om achteraf te kunnen uitleggen waarom een titel werd aanbevolen.';
