# Deploy HPS 1.0 over the current HPS 0.4 deployment

## 1. Back up first
Export the current Supabase database/schema and keep the current Git commit/tag available for rollback.

## 2. Apply database migrations in order
Run these files in Supabase SQL Editor, one at a time:

1. `supabase/migrations/20260901_050_institutions.sql`
2. `supabase/migrations/20260901_060_issuers.sql`
3. `supabase/migrations/20260901_070_evidence_attestations.sql`
4. `supabase/migrations/20260901_100_interop.sql`

Do **not** replace an existing database with the cumulative `schema.sql`; it is intended for a fresh project.

## 3. Confirm Storage
Supabase Storage should contain a **private** bucket named `hps-evidence-vault`.

## 4. Keep existing environment variables
No new secrets are required for this prototype beyond:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HPS_REGISTRY_PUBLIC_KEY`
- `HPS_REGISTRY_SECRET_KEY`

## 5. Deploy code
Replace the application code with this package, run `npm install`, `npm run typecheck`, then `npm run build` before deploying.

## 6. Test in this order

### Creator provenance
1. Sign in.
2. Confirm creator key exists.
3. Create a new v1.0 record from `/create`.
4. Open the public record and confirm creator + registry signatures.
5. Upload the same file at `/verify`; confirm exact hash match and HPS trust mark.
6. Modify/re-export the file and confirm it no longer exact-matches.

### Institutional issuance
1. Create an institution at `/institutional`.
2. In Supabase, change its `verification_status` from `pending` to `verified` only after a real verification review.
3. Create/register the issuer key as an institution admin.
4. Issue a test document.
5. Verify the exact original file from `/verify`.
6. Test supersession and revocation.

### Evidence and attestations
1. POST evidence to `/api/records/{id}/evidence` while authenticated.
2. Confirm the object is stored in the private bucket.
3. Add a signed attestation from `/attest/{id}`.
4. Confirm its signature fields are stored.

### Interoperability
- `GET /api/records/{id}/credentials`
- `GET /api/records/{id}/c2pa`
- `GET /api/badge/{id}`

## 7. Production gates
Before institutional pilots involving real credentials, add formal institution verification, audit logs, hardware/passkey-backed issuer keys, rate limiting, malware scanning, key rotation/revocation and independent security review.
