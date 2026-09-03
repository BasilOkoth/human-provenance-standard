# HPS v1.2 — Creator Evidence + Signed Declaration

Adds creator supporting-evidence uploads and a mandatory signed provenance declaration.

## Install
1. Run `supabase/migrations/20260903_130_creator_evidence.sql` in Supabase SQL Editor.
2. Add `src/app/api/records/[id]/evidence/route.ts`.
3. Apply `creator-evidence-declaration.patch` with `git apply creator-evidence-declaration.patch`, or make the shown edits manually.
4. Run `npm run build`, deploy, and test.

## Trust semantics
- no evidence: self-declared claim
- supporting evidence: evidence-backed claim (not automatically true)
- independent attestation: third-party attested

`sealed` stores the evidence file privately. `hashed` records the signed SHA-256 but does not retain the evidence bytes.

The declaration is inside `creatorClaim`, so the creator signature covers it.
