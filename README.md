# HPS Dispute Notifications + Admin Review v1

This package adds:

- automatic in-app notification to the creator or institutional admin/issuer when a record is challenged
- optional email notification via Resend
- `/notifications` inbox
- visible `Alerts (N)` link in navigation
- admin review workspace at `/hps-admin/disputes/{disputeId}`
- private document review
- SHA-256 exact-match visibility
- request-more-evidence workflow for either challenger or record holder/institution
- optional evidence due date
- preserved evidence-request history

## Install

1. Run:
   `supabase/migrations/20260903_170_dispute_notifications_and_requests.sql`

2. Add:
   `src/lib/hps/notifications.ts`

3. Add:
   `src/app/api/notifications/route.ts`
   `src/app/notifications/page.tsx`

4. Replace:
   `src/components/Nav.tsx`

5. Replace:
   `src/app/api/records/[id]/disputes/route.ts`

6. Replace:
   `src/app/api/hps-admin/disputes/[id]/evidence/route.ts`

7. Add:
   `src/app/hps-admin/disputes/[id]/page.tsx`

8. Replace:
   `src/app/hps-admin/disputes/page.tsx`

## Optional email

In-app notifications work immediately once the migration is active.

To also email users, set in Render:

`RESEND_API_KEY=...`
`HPS_FROM_EMAIL=HPS <notifications@your-verified-domain>`

Do not use NEXT_PUBLIC_ for the API key.

## Flow

Challenge submitted
→ owner/institution gets HPS alert
→ owner opens private dispute workspace
→ admin opens review workspace
→ admin opens submitted private documents
→ admin can request more from owner/institution or challenger
→ requested party gets another alert
→ reviewer decides: no material issue / misrepresentation found

A challenge remains an allegation until reviewed.
