-- HPS v1.4 — opt-in Content Integrity Witness
--
-- The full source document is not stored here. The witness contains only
-- selected critical values and hashed context anchors explicitly approved by
-- the record owner / authorized issuer.

create table if not exists public.hps_content_witnesses (
  record_id text primary key
    references public.hps_records(id) on delete cascade,

  asset_hash text not null,
  mode text not null default 'public_values',
  witness jsonb not null,

  registered_by uuid not null,
  registry_payload jsonb not null,
  registry_signature text not null,
  registry_public_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint hps_content_witness_asset_hash_format
    check (asset_hash ~ '^[a-f0-9]{64}$'),

  constraint hps_content_witness_mode_check
    check (mode in ('public_values'))
);

create index if not exists hps_content_witnesses_asset_hash_idx
  on public.hps_content_witnesses(asset_hash);

alter table public.hps_content_witnesses enable row level security;

-- No direct browser policies are intentionally created.
-- Registration and public comparison are mediated by authenticated / server
-- API routes using HPS authorization and registry-signature checks.
