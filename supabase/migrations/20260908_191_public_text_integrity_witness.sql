-- HPS v1.5 — public textual integrity witness mode
--
-- Existing public_values witnesses remain valid.
-- public_text is explicitly opt-in and may contain normalized recovered text.

alter table public.hps_content_witnesses
  drop constraint if exists hps_content_witness_mode_check;

alter table public.hps_content_witnesses
  add constraint hps_content_witness_mode_check
  check (mode in ('public_values', 'public_text'));
