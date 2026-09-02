# HPS v1.0.2 — Two trust controls

Adds:
1. Private institution-verification evidence uploads.
2. Duplicate asset detection + mandatory relationship declaration for cross-institution claims.

## Install
1. Run `supabase/migrations/20260902_120_institution_evidence_and_asset_relationships.sql` in Supabase SQL Editor.
2. Copy all `src/...` files to the same paths in the HPS repo.
3. Commit, push, and redeploy Render.

## Evidence workflow
Institution admins upload registration certificates, regulator evidence, licences or authorization letters in the Institutional workspace. Files are stored in private Supabase Storage.

HPS admins review evidence at:
`/hps-admin/institutions/<organization-uuid>`

The private evidence link expires after 5 minutes.

## Duplicate asset workflow
If the same institution already registered the exact SHA-256, a second independent issuance is blocked.
If another institution already registered the exact SHA-256, the new institution must declare one of:
- co_issuer
- co_signatory
- attestor
- endorser

The server re-checks the duplicate hash, so browser-side bypass does not remove the rule.
