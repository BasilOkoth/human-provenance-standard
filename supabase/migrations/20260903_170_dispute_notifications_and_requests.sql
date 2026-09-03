create table if not exists public.hps_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hps_notifications_user_idx
  on public.hps_notifications(user_id, created_at desc);

create table if not exists public.hps_evidence_requests (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.hps_disputes(id) on delete cascade,
  record_id text not null references public.hps_records(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  target_role text not null check (target_role in ('challenger','record_holder')),
  request_text text not null check (char_length(request_text) between 10 and 5000),
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open','submitted','satisfied','closed')),
  responded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.hps_dispute_files
  add column if not exists request_id uuid
  references public.hps_evidence_requests(id) on delete set null;

alter table public.hps_notifications enable row level security;
alter table public.hps_evidence_requests enable row level security;
