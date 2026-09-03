create table if not exists public.hps_batches (
  id text primary key,
  org_id uuid not null references public.hps_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  issuer_key_id uuid not null references public.hps_issuer_keys(id) on delete restrict,
  issuer_public_key text not null,
  submitted_count integer not null check (submitted_count >= 0),
  issued_count integer not null check (issued_count >= 0),
  duplicate_count integer not null check (duplicate_count >= 0),
  failed_count integer not null check (failed_count >= 0),
  batch_digest text not null check (batch_digest ~ '^[a-f0-9]{64}$'),
  institution_signature text not null,
  registry_signature text not null,
  registry_public_key text not null,
  claim jsonb not null,
  status text not null default 'complete' check (status in ('complete','void')),
  created_at timestamptz not null default now()
);

create index if not exists hps_batches_org_idx
  on public.hps_batches(org_id, created_at desc);

create table if not exists public.hps_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null references public.hps_batches(id) on delete cascade,
  file_name text not null,
  asset_hash text not null check (asset_hash ~ '^[a-f0-9]{64}$'),
  result_status text not null check (result_status in ('issued','duplicate','failed')),
  hps_record_id text references public.hps_records(id) on delete set null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists hps_batch_items_batch_idx
  on public.hps_batch_items(batch_id);

create index if not exists hps_batch_items_record_idx
  on public.hps_batch_items(hps_record_id);

alter table public.hps_batches enable row level security;
alter table public.hps_batch_items enable row level security;
