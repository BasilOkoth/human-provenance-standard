# HPS Disputes / Under-Review Workflow v1

This package adds a controlled challenge-and-review layer to HPS.

## Important design rule

A dispute submission is **not automatically a public finding**.

Flow:

`ACTIVE → challenge submitted (record remains active) → UNDER REVIEW → ACTIVE or REVOKED`

This prevents malicious or frivolous submissions from instantly damaging a valid record.

## Files

1. Run:
   `supabase/migrations/20260903_150_disputes.sql`

2. Add:
   `src/app/api/records/[id]/disputes/route.ts`

3. Add:
   `src/app/api/hps-admin/disputes/route.ts`

4. Add:
   `src/app/dispute/[id]/page.tsx`

5. Add:
   `src/app/hps-admin/disputes/page.tsx`

## Public record page changes

Edit:

`src/app/records/[id]/page.tsx`

### A. Add public status banners

Immediately after the existing revoked/superseded banners add:

```tsx
{data.status === "under_review" && (
  <div className="supersededBanner">
    UNDER REVIEW · A provenance challenge has been accepted for formal review.
    This status is not a finding that the record is false.
  </div>
)}
```

If you later add a separate `disputed` record status, keep it distinct from
`under_review`. In this v1 design, merely submitting a dispute does not change
the public record status.

### B. Add challenge action

Inside the existing action area add:

```tsx
{data.status !== "revoked" && (
  <Link className="button darkButton" href={`/dispute/${id}`}>
    Challenge provenance
  </Link>
)}
```

Example:

```tsx
<div className="actions">
  <Link className="button primary" href="/verify">Verify this file</Link>
  <Link className="button darkButton" href={`/api/records/${id}/credentials`}>VC export</Link>
  <Link className="button darkButton" href={`/api/records/${id}/c2pa`}>C2PA mapping</Link>
  {data.status !== "revoked" && (
    <Link className="button darkButton" href={`/dispute/${id}`}>
      Challenge provenance
    </Link>
  )}
</div>
```

## Record status constraint

If `hps_records.status` is protected by a PostgreSQL CHECK constraint that only
allows older values such as `active`, `revoked`, and `superseded`, update that
constraint to include `under_review` before using this workflow.

Because the original base migration that created `hps_records` may differ from
the currently visible migration set, inspect the existing constraint in Supabase
before changing it. Do not blindly drop a constraint whose exact name you have
not confirmed.

## Admin access

The review API uses:

`HPS_ADMIN_EMAILS`

Your existing HPS deployment already uses this environment variable for HPS
administrator access. Keep that server-side only.

Admin review page:

`/hps-admin/disputes`

## Why this is safer than automatic "disputed"

Any authenticated person can make an allegation. HPS should not present an
allegation as a verified fact. Therefore:

- `open` = challenge received privately
- `under_review` = HPS accepted it for formal review
- `resolved_no_issue` = no material issue established
- `misrepresentation_found` = review found material misrepresentation and the
  record is revoked

The original signed manifest is never edited.
