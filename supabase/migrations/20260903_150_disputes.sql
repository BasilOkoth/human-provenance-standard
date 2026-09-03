create table if not exists public.hps_disputes (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references public.hps_records(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in (
    'authorship',
    'ownership',
    'identity',
    'institutional_authority',
    'evidence',
    'ai_use_disclosure',
    'document_validity',
    'other'
  )),
  statement text not null check (char_length(statement) between 20 and 5000),
  evidence_url text,
  status text not null default 'open' check (status in (
    'open',
    'under_review',
    'resolved_no_issue',
    'misrepresentation_found',
    'withdrawn'
  )),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists hps_disputes_record_idx
  on public.hps_disputes(record_id, created_at desc);

create index if not exists hps_disputes_status_idx
  on public.hps_disputes(status, created_at desc);

create table if not exists public.hps_record_status_events (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references public.hps_records(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  dispute_id uuid references public.hps_disputes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists hps_record_status_events_record_idx
  on public.hps_record_status_events(record_id, created_at desc);

alter table public.hps_disputes enable row level security;
alter table public.hps_record_status_events enable row level security;

-- Access is intentionally mediated by server routes using the service-role client.
-- This avoids exposing challenger identity or private review notes via direct table reads.
