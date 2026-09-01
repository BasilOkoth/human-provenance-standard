create extension if not exists pgcrypto;

create table if not exists public.hps_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  public_key text,
  identity_assurance text not null default 'account_verified',
  institution text,
  institution_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hps_records (
  id text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  creator_name text not null,
  work_type text not null,
  asset_hash text not null,
  manifest jsonb not null,
  creator_signature text,
  creator_public_key text,
  registry_signature text not null,
  registry_public_key text not null,
  version integer not null default 1,
  parent_record_id text references public.hps_records(id) on delete set null,
  status text not null default 'active',
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.hps_attestations (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references public.hps_records(id) on delete cascade,
  attestor_user_id uuid not null references auth.users(id) on delete cascade,
  attestor_name text not null,
  institution text,
  claim_type text not null,
  statement text not null,
  assurance text not null default 'account_verified',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists hps_records_created_idx on public.hps_records(created_at desc);
create index if not exists hps_records_owner_idx on public.hps_records(owner_user_id);
create index if not exists hps_attestations_record_idx on public.hps_attestations(record_id);

alter table public.hps_profiles enable row level security;
alter table public.hps_records enable row level security;
alter table public.hps_attestations enable row level security;

drop policy if exists "profiles public read" on public.hps_profiles;
create policy "profiles public read"
on public.hps_profiles for select using (true);

drop policy if exists "profiles own update" on public.hps_profiles;
create policy "profiles own update"
on public.hps_profiles for update using (auth.uid() = user_id);

drop policy if exists "profiles own insert" on public.hps_profiles;
create policy "profiles own insert"
on public.hps_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "records public read" on public.hps_records;
create policy "records public read"
on public.hps_records for select using (true);

drop policy if exists "attestations public read" on public.hps_attestations;
create policy "attestations public read"
on public.hps_attestations for select using (status = 'active');

create or replace function public.handle_new_hps_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.hps_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_hps on auth.users;
create trigger on_auth_user_created_hps
  after insert on auth.users
  for each row execute procedure public.handle_new_hps_user();
