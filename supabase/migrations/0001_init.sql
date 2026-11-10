-- Yucan Prospection : schéma initial
-- Chaque table est protégée par RLS : une utilisatrice ne voit que ses propres données.

create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'claude' check (provider in ('claude', 'openai')),
  anthropic_key text not null default '',
  openai_key text not null default '',
  claude_model text not null default 'claude-opus-5-5',
  openai_model text not null default 'gpt-4o',
  my_name text not null default '',
  my_offer text not null default '',
  my_target text not null default '',
  tone text not null default 'professionnel, chaleureux et direct, vouvoiement',
  language text not null default 'français',
  signature text not null default '',
  limit_invites int not null default 20,
  limit_visits int not null default 60,
  limit_messages int not null default 40,
  hour_start int not null default 9,
  hour_end int not null default 18,
  days int[] not null default '{1,2,3,4,5}',
  gap_min int not null default 2,
  gap_max int not null default 6,
  timezone text not null default 'Europe/Paris',
  auto_analyze boolean not null default true,
  paused boolean not null default true,
  force_next boolean not null default false,
  next_action_at timestamptz,
  extension_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  steps jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index campaigns_user_idx on public.campaigns (user_id);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  full_name text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  headline text not null default '',
  company text not null default '',
  location text not null default '',
  about text not null default '',
  experience text not null default '',
  education text not null default '',
  status text not null default 'nouveau'
    check (status in ('nouveau', 'actif', 'a_valider', 'a_repondu', 'non_accepte', 'termine', 'pause', 'erreur')),
  campaign_id uuid references public.campaigns (id) on delete set null,
  step_index int not null default 0,
  next_at timestamptz,
  locked_until timestamptz,
  invited_at timestamptz,
  connected_at timestamptz,
  replied_at timestamptz,
  errors int not null default 0,
  last_error text not null default '',
  pending_message jsonb,
  approved_message jsonb,
  analysis jsonb,
  sent_messages jsonb not null default '[]',
  history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);
create index prospects_due_idx on public.prospects (user_id, status, next_at);
create index prospects_campaign_idx on public.prospects (campaign_id);

create table public.daily_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  invites int not null default 0,
  visits int not null default 0,
  messages int not null default 0,
  primary key (user_id, day)
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  text text not null,
  created_at timestamptz not null default now()
);
create index activity_log_user_idx on public.activity_log (user_id, created_at desc);

-- Jetons qui relient l'extension Chrome au compte. Seule l'empreinte SHA-256 est stockée.
create table public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'Extension Chrome',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index extension_tokens_user_idx on public.extension_tokens (user_id);

-- Mise à jour automatique de updated_at
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger prospects_touch before update on public.prospects
  for each row execute function public.touch_updated_at();

-- Réglages créés automatiquement à l'inscription
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Incrément atomique des compteurs quotidiens (appelé côté serveur)
create function public.increment_counter(p_user uuid, p_day date, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.daily_counters (user_id, day) values (p_user, p_day) on conflict do nothing;
  if p_kind = 'invites' then
    update public.daily_counters set invites = invites + 1 where user_id = p_user and day = p_day;
  elsif p_kind = 'visits' then
    update public.daily_counters set visits = visits + 1 where user_id = p_user and day = p_day;
  elsif p_kind = 'messages' then
    update public.daily_counters set messages = messages + 1 where user_id = p_user and day = p_day;
  end if;
end;
$$;
revoke execute on function public.increment_counter(uuid, date, text) from public, anon, authenticated;

-- Sécurité au niveau des lignes
alter table public.settings enable row level security;
alter table public.campaigns enable row level security;
alter table public.prospects enable row level security;
alter table public.daily_counters enable row level security;
alter table public.activity_log enable row level security;
alter table public.extension_tokens enable row level security;

create policy "own settings" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own campaigns" on public.campaigns for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own prospects" on public.prospects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own counters" on public.daily_counters for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own log read" on public.activity_log for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own log insert" on public.activity_log for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own tokens" on public.extension_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
