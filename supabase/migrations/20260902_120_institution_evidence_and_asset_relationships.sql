create table if not exists public.hps_org_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.hps_organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  evidence_type text not null,
  registration_number text,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists hps_org_verification_evidence_org_idx on public.hps_org_verification_evidence(org_id, created_at desc);
alter table public.hps_org_verification_evidence enable row level security;

insert into storage.buckets (id, name, public)
values ('hps-institution-evidence', 'hps-institution-evidence', false)
on conflict (id) do update set public = false;

create table if not exists public.hps_asset_relationships (
  id uuid primary key default gen_random_uuid(),
  asset_hash text not null check (asset_hash ~ '^[a-f0-9]{64}$'),
  record_id text not null references public.hps_records(id) on delete cascade,
  related_record_id text not null references public.hps_records(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('co_issuer','co_signatory','attestor','endorser')),
  declaring_org_id uuid not null references public.hps_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(record_id, related_record_id, relationship_type)
);
create index if not exists hps_asset_relationships_hash_idx on public.hps_asset_relationships(asset_hash);
alter table public.hps_asset_relationships enable row level security;
