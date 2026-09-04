-- HPS v1.3 — OCR, cross-format document provenance and explicit digitization/transcription
-- Run once in Supabase before deploying the matching application code.

alter table public.hps_records
  add column if not exists content_canonical_sha256 text,
  add column if not exists structure_simhash64 text;

alter table public.hps_records
  drop constraint if exists hps_records_content_canonical_sha256_format;

alter table public.hps_records
  add constraint hps_records_content_canonical_sha256_format
  check (
    content_canonical_sha256 is null
    or content_canonical_sha256 ~ '^[a-f0-9]{64}$'
  );

alter table public.hps_records
  drop constraint if exists hps_records_structure_simhash64_format;

alter table public.hps_records
  add constraint hps_records_structure_simhash64_format
  check (
    structure_simhash64 is null
    or structure_simhash64 ~ '^[a-f0-9]{16}$'
  );

create index if not exists hps_records_content_canonical_sha256_idx
  on public.hps_records(content_canonical_sha256)
  where content_canonical_sha256 is not null;

create index if not exists hps_records_structure_simhash64_idx
  on public.hps_records(structure_simhash64)
  where structure_simhash64 is not null;

-- Keep searchable columns synchronized with the signed JSON fingerprint. This
-- avoids requiring every issuance route to duplicate the extraction logic.
create or replace function public.hps_sync_resilient_fingerprint_columns()
returns trigger
language plpgsql
as $$
begin
  new.content_canonical_sha256 := nullif(new.asset_fingerprint->>'contentCanonicalSha256', '');
  new.structure_simhash64 := nullif(new.asset_fingerprint->>'structureSimHash64', '');
  return new;
end;
$$;

drop trigger if exists hps_sync_resilient_fingerprint_columns on public.hps_records;
create trigger hps_sync_resilient_fingerprint_columns
before insert or update of asset_fingerprint
on public.hps_records
for each row
execute function public.hps_sync_resilient_fingerprint_columns();

-- Backfill records that already contain the enhanced JSON fingerprint.
update public.hps_records
set
  content_canonical_sha256 = nullif(asset_fingerprint->>'contentCanonicalSha256', ''),
  structure_simhash64 = nullif(asset_fingerprint->>'structureSimHash64', '')
where asset_fingerprint is not null;

-- Extend the explicit derivative vocabulary.
alter table public.hps_registered_derivatives
  drop constraint if exists hps_registered_derivatives_transformation_type_check;

alter table public.hps_registered_derivatives
  add constraint hps_registered_derivatives_transformation_type_check
  check (
    transformation_type in (
      'compression',
      'optimization',
      'format_conversion',
      'digitization',
      'transcription',
      'resize',
      'metadata_stripped',
      'transmission',
      'other'
    )
  );
