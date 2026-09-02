-- HPS v1.1 — Compression-resilient provenance
-- Adds signed multi-layer fingerprints and explicit derivative lineage.

alter table public.hps_records
  add column if not exists asset_fingerprint jsonb,
  add column if not exists canonical_text_sha256 text,
  add column if not exists fingerprint_version text;

alter table public.hps_records
  drop constraint if exists hps_records_canonical_text_sha256_format;

alter table public.hps_records
  add constraint hps_records_canonical_text_sha256_format
  check (canonical_text_sha256 is null or canonical_text_sha256 ~ '^[a-f0-9]{64}$');

create index if not exists hps_records_canonical_text_sha256_idx
  on public.hps_records(canonical_text_sha256)
  where canonical_text_sha256 is not null;

create index if not exists hps_records_fingerprint_version_idx
  on public.hps_records(fingerprint_version)
  where fingerprint_version is not null;

create table if not exists public.hps_registered_derivatives (
  id uuid primary key default gen_random_uuid(),
  parent_record_id text not null references public.hps_records(id) on delete cascade,
  derivative_sha256 text not null check (derivative_sha256 ~ '^[a-f0-9]{64}$'),
  transformation_type text not null check (
    transformation_type in (
      'compression',
      'optimization',
      'format_conversion',
      'resize',
      'metadata_stripped',
      'transmission',
      'other'
    )
  ),
  derivative_fingerprint jsonb not null,
  comparison jsonb not null,
  assurance text not null check (assurance in ('high','medium','low')),
  note text,
  registered_by uuid not null references auth.users(id),
  registry_payload jsonb,
  registry_signature text,
  registry_public_key text,
  created_at timestamptz not null default now(),
  unique(parent_record_id, derivative_sha256)
);

create index if not exists hps_registered_derivatives_parent_idx
  on public.hps_registered_derivatives(parent_record_id, created_at desc);

create index if not exists hps_registered_derivatives_hash_idx
  on public.hps_registered_derivatives(derivative_sha256);

alter table public.hps_registered_derivatives enable row level security;

drop policy if exists "registered derivatives public read" on public.hps_registered_derivatives;
create policy "registered derivatives public read"
on public.hps_registered_derivatives
for select
using (true);

-- Registration itself is intentionally mediated by the server route so that
-- authorization, fingerprint comparison and registry countersigning cannot be
-- bypassed with a direct browser insert.
