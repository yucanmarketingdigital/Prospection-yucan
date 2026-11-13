-- Derniers posts LinkedIn et poste actuel, lus pendant l'étape « Visiter le profil ».
alter table public.prospects
  add column if not exists recent_posts jsonb not null default '[]',
  add column if not exists current_position text not null default '';
