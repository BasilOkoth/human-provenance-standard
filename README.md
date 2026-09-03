# HPS Revocation UI

The repository already contains a working revocation API at:

`src/app/api/records/[id]/revoke/route.ts`

This package adds the missing user-facing record control and hardens the API.

## 1. Add the client component

Create:

`src/components/RevokeRecord.tsx`

using the supplied `RevokeRecord.tsx`.

## 2. Replace the revoke API

Replace:

`src/app/api/records/[id]/revoke/route.ts`

with the supplied `route.ts`.

The updated route:
- requires authentication
- requires a meaningful reason
- permits the creator/record owner
- permits active institutional `admin` or `issuer`
- only revokes active records
- prevents repeated revocation
- preserves the record and returns revocation metadata

## 3. Add it to the public record page

In:

`src/app/records/[id]/page.tsx`

add this import near the top:

```tsx
import RevokeRecord from "@/components/RevokeRecord";
```

Then, immediately after the existing action buttons block:

```tsx
<div className="actions">
  <Link className="button primary" href="/verify">Verify this file</Link>
  <Link className="button darkButton" href={`/api/records/${id}/credentials`}>VC export</Link>
  <Link className="button darkButton" href={`/api/records/${id}/c2pa`}>C2PA mapping</Link>
</div>
```

insert:

```tsx
<RevokeRecord recordId={id} status={data.status} />
```

## Result

When a signed-in owner or authorized institutional issuer views an active record,
they will see **Record controls**. Opening it presents a revocation warning, reason
field, explicit acknowledgement, and **Revoke record** action.

After revocation the page reloads. Your existing public record page already renders:

`REVOKED · <reason>`

and stops displaying the valid provenance trust mark because `active` is false.

## Important semantics

Revocation must never delete a provenance record. It changes its status while
preserving the record and reason as part of the provenance history.
