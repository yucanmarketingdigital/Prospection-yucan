-- Variables personnalisées par prospect (colonnes supplémentaires d'un CSV : {{icebreaker}}, {{secteur}}…)
alter table public.prospects add column custom jsonb not null default '{}';
