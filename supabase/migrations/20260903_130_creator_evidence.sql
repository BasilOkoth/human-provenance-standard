-- HPS v1.2 — Creator evidence vault + signed provenance declaration

create table if not exists public.hps_creator_evidence (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references public.hps_records(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_id text not null,
  evidence_type text not null,
  visibility text not null check (visibility in ('hashed','sealed')),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text,
  note text,
  created_at timestamptz not null default now(),
  unique(record_id, evidence_id)
);

create index if not exists hps_creator_evidence_record_idx
  on public.hps_creator_evidence(record_id, created_at);
create index if not exists hps_creator_evidence_hash_idx
  on public.hps_creator_evidence(sha256);
alter table public.hps_creator_evidence enable row level security;

insert into storage.buckets (id, name, public)
values ('hps-creator-evidence', 'hps-creator-evidence', false)
on conflict (id) do update set public = false;
