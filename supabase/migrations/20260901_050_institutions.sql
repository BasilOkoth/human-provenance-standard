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
