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
