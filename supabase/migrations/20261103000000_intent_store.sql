-- Intent server-side store. Only the server (secret key) reads or writes;
-- RLS is on with no policies, so the public/anon key gets nothing.
create table if not exists public.intent_profiles (
  user_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.intent_things (
  id uuid primary key,
  user_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists intent_things_user_idx on public.intent_things (user_id, updated_at desc);
create table if not exists public.intent_entries (
  id uuid primary key,
  thing_id uuid not null references public.intent_things (id) on delete cascade,
  seq bigint generated always as identity,
  data jsonb not null
);
create index if not exists intent_entries_thing_idx on public.intent_entries (thing_id, seq);
create table if not exists public.intent_memories (
  id uuid primary key,
  user_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists intent_memories_user_idx on public.intent_memories (user_id, created_at);

alter table public.intent_profiles enable row level security;
alter table public.intent_things enable row level security;
alter table public.intent_entries enable row level security;
alter table public.intent_memories enable row level security;
revoke all on public.intent_profiles, public.intent_things, public.intent_entries, public.intent_memories from anon, authenticated;
