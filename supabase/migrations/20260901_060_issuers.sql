-- HPS v0.6: authorized issuers + institution signatures + lifecycle
create table if not exists public.hps_issuer_keys (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.hps_organizations(id) on delete cascade,
  public_key text not null, algorithm text not null default 'Ed25519', label text, status text not null default 'active',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), revoked_at timestamptz
);
alter table public.hps_records add column if not exists issuer_key_id uuid references public.hps_issuer_keys(id) on delete set null;
alter table public.hps_records add column if not exists institution_signature text;
alter table public.hps_records add column if not exists superseded_by_id text references public.hps_records(id) on delete set null;
