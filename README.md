# HPS v1.2 Public Record Display

Replace:

`src/app/records/[id]/page.tsx`

This adds public display for:
- creator-signed declaration
- AI-use declaration
- evidence count
- evidence assurance
- evidence type
- evidence visibility
- evidence SHA-256
- evidence note
- clear HPS trust semantics

Important:
Apply the HPS v1.2 creator-evidence/schema patch first so the creator signature verification includes the new signed claim fields.

The public page never exposes sealed evidence files. It only displays their signed metadata and SHA-256.
