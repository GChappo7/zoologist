-- Zoologist account and game-state storage
-- Run this once in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_version integer not null default 1,
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.game_states enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can view own game state" on public.game_states;
create policy "Users can view own game state" on public.game_states
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own game state" on public.game_states;
create policy "Users can insert own game state" on public.game_states
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own game state" on public.game_states;
create policy "Users can update own game state" on public.game_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own game state" on public.game_states;
create policy "Users can delete own game state" on public.game_states
  for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists game_states_set_updated_at on public.game_states;
create trigger game_states_set_updated_at
before update on public.game_states
for each row execute function public.set_updated_at();
