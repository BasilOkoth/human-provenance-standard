-- HPS v1.0: interoperability metadata + API clients
create table if not exists public.hps_api_keys (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references public.hps_organizations(id) on delete cascade, name text not null, key_hash text not null unique,
  scopes text[] not null default array['verify'], status text not null default 'active', last_used_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists hps_records_asset_hash_idx on public.hps_records(asset_hash);
create index if not exists hps_records_issuer_org_idx on public.hps_records(issuer_org_id);
create index if not exists hps_evidence_record_idx on public.hps_evidence_vault(record_id);
