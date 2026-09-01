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



-- HPS v0.5: institutional accounts + direct verification + badge support
create table if not exists public.hps_organizations (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  verification_status text not null default 'pending', verified_at timestamptz, verified_by uuid references auth.users(id),
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.hps_org_members (
  org_id uuid not null references public.hps_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'verifier', status text not null default 'active', created_at timestamptz not null default now(),
  primary key(org_id,user_id)
);
alter table public.hps_records add column if not exists record_kind text not null default 'creator_provenance';
alter table public.hps_records add column if not exists issuer_org_id uuid references public.hps_organizations(id) on delete set null;


-- HPS v0.6: authorized issuers + institution signatures + lifecycle
create table if not exists public.hps_issuer_keys (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.hps_organizations(id) on delete cascade,
  public_key text not null, algorithm text not null default 'Ed25519', label text, status text not null default 'active',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), revoked_at timestamptz
);
alter table public.hps_records add column if not exists issuer_key_id uuid references public.hps_issuer_keys(id) on delete set null;
alter table public.hps_records add column if not exists institution_signature text;
alter table public.hps_records add column if not exists superseded_by_id text references public.hps_records(id) on delete set null;


-- HPS v0.7: evidence vault + signed attestations + verification events
alter table public.hps_attestations add column if not exists attestor_public_key text;
alter table public.hps_attestations add column if not exists attestor_signature text;
alter table public.hps_attestations add column if not exists signed_payload text;
create table if not exists public.hps_evidence_vault (
  id uuid primary key default gen_random_uuid(), record_id text not null references public.hps_records(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null, storage_path text not null unique, filename text not null,
  sha256 text not null, visibility text not null default 'sealed', content_type text, size_bytes bigint,
  created_at timestamptz not null default now()
);
create table if not exists public.hps_verification_events (
  id uuid primary key default gen_random_uuid(), record_id text references public.hps_records(id) on delete set null,
  asset_hash text not null, matches boolean not null, verification_type text not null default 'asset_hash', created_at timestamptz not null default now()
);
insert into storage.buckets (id,name,public) values ('hps-evidence-vault','hps-evidence-vault',false) on conflict (id) do nothing;


-- HPS v1.0: interoperability metadata + API clients
create table if not exists public.hps_api_keys (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references public.hps_organizations(id) on delete cascade, name text not null, key_hash text not null unique,
  scopes text[] not null default array['verify'], status text not null default 'active', last_used_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists hps_records_asset_hash_idx on public.hps_records(asset_hash);
create index if not exists hps_records_issuer_org_idx on public.hps_records(issuer_org_id);
create index if not exists hps_evidence_record_idx on public.hps_evidence_vault(record_id);


alter table public.hps_organizations enable row level security;
alter table public.hps_org_members enable row level security;
alter table public.hps_issuer_keys enable row level security;
alter table public.hps_evidence_vault enable row level security;
alter table public.hps_verification_events enable row level security;
alter table public.hps_api_keys enable row level security;

drop policy if exists "organizations public read" on public.hps_organizations;
create policy "organizations public read" on public.hps_organizations for select using (verification_status='verified' or created_by=auth.uid());
drop policy if exists "members own read" on public.hps_org_members;
create policy "members own read" on public.hps_org_members for select using (user_id=auth.uid());
drop policy if exists "issuer keys public read" on public.hps_issuer_keys;
create policy "issuer keys public read" on public.hps_issuer_keys for select using (status='active');
-- Evidence bucket remains private; evidence reads/writes are mediated by authenticated server routes.
