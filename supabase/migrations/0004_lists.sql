-- Listes de prospects (créées depuis une recherche LinkedIn ou un fichier Excel/CSV)
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  source text not null default 'manuel' check (source in ('linkedin', 'fichier', 'manuel')),
  created_at timestamptz not null default now()
);
create index lists_user_idx on public.lists (user_id);
alter table public.lists enable row level security;
create policy "own lists" on public.lists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.prospects add column list_id uuid references public.lists (id) on delete set null;
create index prospects_list_idx on public.prospects (list_id);
