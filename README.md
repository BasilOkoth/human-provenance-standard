# Human Provenance Standard — HPS 1.0 Trust Infrastructure

HPS is an open provenance and digital authenticity layer for human-created, AI-assisted and institution-issued work. It does not reduce trust to a single score. It exposes separate trust layers: origin, contribution, identity, signatures, asset integrity, evidence, attestations and lifecycle status.

## What is included

### v0.5 — Institutions + direct verification
- Institution accounts and membership roles.
- Direct file verification by SHA-256 lookup: users can upload a file without first finding its manifest.
- Compact portable HPS SVG badge endpoint.

### v0.6 — Authorized institutional issuance
- Admin / issuer / auditor / verifier roles.
- Organization-held Ed25519 issuer identities.
- Institution-signed records.
- Version lineage, supersession and revocation.

### v0.7 — Evidence + attestations + SDK
- Private Supabase Storage evidence vault with hash metadata.
- Cryptographically signed third-party attestations.
- TypeScript SDK in `sdk/hps.ts`.

### v1.0 — Interoperability + stronger signing
- Canonical creator and institutional claims are signed directly, rather than signing an unrelated string.
- Registry countersigns the complete HPS manifest.
- W3C Verifiable Credential-compatible export endpoint.
- C2PA assertion mapping endpoint.

## Important interoperability note
The C2PA endpoint is a mapping/export layer, **not a native binary C2PA Content Credential**. Native C2PA embedding requires a C2PA SDK plus signing certificate pipeline. The VC endpoint emits an HPS-signed VC-shaped credential using the HPS JCS/Ed25519 cryptosuite identifier; production standards work should register/finalize the cryptosuite and verification method profile.

## Trust semantics
- `HPS ✓ PROVENANCE VERIFIED` after direct file verification means the uploaded file hash exactly matches a registered asset and the selected record has a valid registry signature and active status.
- A matching hash does not prove every factual statement inside a document is true.
- HPS institution verification must be completed before an institution can issue institutional records.
- Revoked and superseded records remain historically visible.

## Setup
1. Apply `supabase/schema.sql` on a fresh project, **or** apply the four migration files under `supabase/migrations/` to an existing v0.4 deployment.
2. Configure the existing Supabase and HPS registry environment variables.
3. Ensure the private `hps-evidence-vault` Storage bucket exists (the migration attempts to create it).
4. Deploy with Node 22+.

## Required environment variables
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HPS_REGISTRY_PUBLIC_KEY`
- `HPS_REGISTRY_SECRET_KEY`

## Institutional verification
Organization creation starts in `pending`. For the prototype, verification status must be changed by a trusted HPS administrator in Supabase. Before production launch, build a formal KYB/domain/document review workflow and an audit log rather than manually toggling the field.

## Security work still recommended before production
- Move local issuer/creator keys toward WebAuthn/passkeys or hardware/HSM-backed keys.
- Add registry key rotation, key IDs, expiry and revocation lists.
- Add rate limiting and API-key middleware.
- Add malware scanning and client-side encryption for sealed evidence.
- Complete independent RFC 8785/JCS conformance tests.
- Add native C2PA SDK integration and a standards-compliant VC Data Integrity suite.
- Add institution-verification audit workflow.

This package is a cumulative v1.0 implementation built on the HPS 0.4 prototype. Existing 0.4 manifests remain parseable for public registry compatibility.
