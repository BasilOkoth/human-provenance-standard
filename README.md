# HPS v1.1 — Compression-Resilient Provenance

This patch closes a major integrity gap in HPS: harmless technical transformations can change the raw SHA-256 even when the human-visible document is effectively the same.

HPS v1.1 keeps exact-file SHA-256 as the strongest identity and adds a second, signed transformation-provenance layer.

## What it adds

### 1. Exact original verification
The existing SHA-256 remains authoritative.

**Status:** `exact_original`

A match means the file is byte-for-byte identical to the registered asset.

### 2. Signed compression-resilient fingerprints
For supported files HPS records a fingerprint *inside the creator/institution claim*, so it is covered by the creator/institution Ed25519 signature and then by the HPS registry countersignature.

The v1 fingerprint can include:

- exact SHA-256
- conservative canonical-text SHA-256
- 64-bit text SimHash for relationship discovery only
- page count
- per-page perceptual pHash
- per-page dHash
- visual coverage
- MIME type and file size

### 3. PDF handling
PDFs are processed locally in the browser with PDF.js.

HPS:

- extracts the full text layer from every page
- normalizes only representation differences such as Unicode form, whitespace, line endings and soft hyphens
- **does not** lowercase, remove numbers, strip punctuation or reorder text
- renders page previews locally and computes visual hashes
- never sends the uploaded PDF bytes to the verification API

This means a change from `KES 100,000` to `KES 10,000`, or any other textual edit, changes the canonical-text SHA-256.

### 4. DOCX handling
DOCX text is extracted locally with Mammoth and canonically hashed. Because this v1.1 patch does not yet create a full visual/layout fingerprint for DOCX, HPS is deliberately conservative when only text evidence is available.

### 5. Image handling
Images receive perceptual pHash + dHash fingerprints in addition to exact SHA-256. Perceptual fingerprints are supporting evidence, never cryptographic equality.

### 6. Transformation classifications

| Status | Meaning |
|---|---|
| `exact_original` | Raw SHA-256 matches the registered original. |
| `registered_derivative` | The derivative hash was explicitly registered against the parent HPS record after high-assurance comparison. |
| `verified_derivative` | Bytes differ, but canonical content + presentation evidence support a non-material transformation such as compression/optimization. |
| `derivative_candidate` | A strong relationship exists, but HPS lacks enough evidence to certify full equivalence. Common for scanned/image-only PDFs. |
| `modified_derivative` | HPS can relate the file to the original, but one or more meaningful content/presentation signals changed. |
| `unverified` | No sufficiently strong relationship was established. |
| `revoked` | The parent provenance record has been revoked. |

## Security rule

**Perceptual similarity alone never becomes `verified_derivative`.**

For text-bearing PDFs, high-assurance derivative verification requires exact canonical text plus sufficiently similar visual fingerprints and consistent page structure. This is intentionally stricter than a generic “fuzzy hash”.

For scanned/image-only PDFs, HPS returns `derivative_candidate` rather than claiming the content is unchanged.

## Explicit derivative lineage

Authenticated owners / authorized institution issuers can register a high-assurance derivative through:

`POST /api/records/{record-id}/derivatives`

Supported transformation declarations:

- `compression`
- `optimization`
- `format_conversion`
- `resize`
- `metadata_stripped`
- `transmission`
- `other`

The registered derivative receives a registry-signed relationship payload and becomes directly discoverable by its own SHA-256.

## Installation

This patch is designed for the current HPS v1.0.x / v1.0.2 codebase.

### Recommended

1. Back up / commit the current HPS repository.
2. Extract this patch into a temporary folder.
3. From the HPS repo root run:

```bash
python /path/to/hps-v1.1-compression-resilient-provenance/apply_hps_v1_1_patch.py
```

4. Install dependencies:

```bash
npm install
```

5. In Supabase SQL Editor run:

```text
supabase/migrations/20260902_130_compression_resilient_provenance.sql
```

6. Test locally:

```bash
npm run typecheck
npm run build
```

7. Commit, push and redeploy Render.

## New public verifier

`/verify/derivative`

This verifier processes the file locally and sends only the HPS fingerprint to the server.

## Important compatibility note

Existing HPS records remain valid and continue to verify by exact SHA-256. They cannot gain compression-resilient verification retrospectively unless a new signed/superseding HPS record is issued with the v1.1 fingerprint. This avoids silently attaching unsigned fingerprint evidence to older provenance records.

## Suggested test

1. Register a PDF through HPS v1.1.
2. Verify the exact original: expect `EXACT ORIGINAL`.
3. Compress the PDF using a normal PDF optimizer without changing text/content.
4. Verify the compressed copy: expect `VERIFIED DERIVATIVE` if canonical text and visual evidence remain aligned.
5. Change one number or sentence and export again: expect `MODIFIED DERIVATIVE` or no high-assurance derivative result.
6. For a scanned PDF with no text layer: expect `DERIVATIVE CANDIDATE`, not `VERIFIED DERIVATIVE`.

## Next hardening work

The next production step should add OCR-backed canonical text for scanned PDFs, algorithm-version migration tests, benchmark fixtures across major PDF compressors, rate limiting, and independent adversarial evaluation of visual-hash collision/false-positive behavior.
