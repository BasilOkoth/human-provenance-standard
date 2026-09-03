# HPS Private Dispute Evidence v1

This add-on strengthens the HPS dispute workflow by allowing both sides to upload
files privately and by cryptographically linking every submission to the case.

## What it adds

- private Supabase bucket: `hps-dispute-evidence`
- table: `hps_dispute_files`
- SHA-256 generated server-side for every uploaded file
- immutable evidence metadata preserved under the dispute ID
- challenger uploads
- record-holder / institutional issuer response uploads
- automatic comparison against the HPS record's registered `asset_hash`
- explicit `exact_asset_match` result
- private signed download links
- HPS admin evidence endpoint
- case workspace at `/disputes/[id]`

## Install order

This package assumes the earlier dispute workflow is installed and the following
table already exists:

`hps_disputes`

### 1. Run migration

Run:

`supabase/migrations/20260903_160_private_dispute_evidence.sql`

### 2. Add API routes

Add:

`src/app/api/disputes/[id]/files/route.ts`

`src/app/api/disputes/[id]/files/[fileId]/download/route.ts`

`src/app/api/hps-admin/disputes/[id]/evidence/route.ts`

### 3. Add private case page

Add:

`src/app/disputes/[id]/page.tsx`

## Update the dispute submission page

After a dispute is successfully created, direct the challenger to the private
case workspace.

If your existing POST result contains:

```ts
result.disputeId
```

replace the simple success state with:

```ts
window.location.href = `/disputes/${result.disputeId}`;
```

This lets the challenger immediately upload private evidence.

## Add record-holder access

When HPS notifies a creator or institutional issuer of a challenge, link them to:

`/disputes/{disputeId}`

The server determines their role automatically. They cannot impersonate the
challenger.

## Admin review

The HPS administrator can query:

`GET /api/hps-admin/disputes/{disputeId}/evidence`

The response includes:
- record metadata
- registered SHA-256
- every private evidence fingerprint
- who supplied it (challenger vs record holder)
- purpose
- exact-asset-match result
- number of exact registered-asset submissions

Admin/private file opening uses:

`/api/disputes/{disputeId}/files/{fileId}/download`

The route creates a short-lived signed URL. The storage bucket itself remains
private.

## Security / trust semantics

### A hash match means only exact identity of bytes

When:

`uploaded_file_sha256 === hps_records.asset_hash`

HPS may say:

`✓ SHA-256 EXACT MATCH — supplied file is byte-for-byte identical to the registered HPS asset.`

It must NOT automatically say:
- authentic content
- truthful content
- valid certificate
- human-created
- institutionally genuine

Those conclusions require separate provenance and review evidence.

### A non-match is not automatically evidence of fraud

A PDF saved again, image recompressed, metadata modified or messaging-app copy
can produce a different SHA-256. HPS should state:

`No exact byte match with the registered asset.`

Do not label the file fraudulent solely because hashes differ.

## Privacy

This implementation deliberately creates no public Storage RLS policy.
Files are accessed through server routes using authenticated authorization.

Allowed private viewers:
- challenger who opened the dispute
- record owner
- active institutional admin/issuer for institutional records
- HPS admin for formal review

## Recommended later hardening

For production institutional adoption, consider:
- malware scanning before reviewer download
- retention policy for resolved disputes
- evidence deletion/legal-hold policy
- encryption-at-rest/key-management documentation
- maximum case/file quotas
- audit log for every evidence download
- automatic notifications to the record holder
- signed reviewer decisions
