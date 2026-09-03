create table if not exists public.hps_dispute_files (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.hps_disputes(id) on delete cascade,
  record_id text not null references public.hps_records(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploader_role text not null check (uploader_role in ('challenger','record_holder')),
  purpose text not null check (purpose in ('supporting_evidence','original_asset','response_evidence')),
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  registered_asset_hash text,
  exact_asset_match boolean not null default false,
  storage_path text not null unique,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists hps_dispute_files_dispute_idx
  on public.hps_dispute_files(dispute_id, created_at asc);

create index if not exists hps_dispute_files_record_idx
  on public.hps_dispute_files(record_id, created_at asc);

create index if not exists hps_dispute_files_hash_idx
  on public.hps_dispute_files(sha256);

alter table public.hps_dispute_files enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('hps-dispute-evidence', 'hps-dispute-evidence', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- No public storage policies are created.
-- All reads/writes go through authenticated server routes using the service-role client.
