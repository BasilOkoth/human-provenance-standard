# HPS Transformation Provenance Architecture

```text
REGISTERED ORIGINAL
  │
  ├─ SHA-256 -------------------------- cryptographic exact identity
  │
  ├─ canonical text SHA-256 ----------- conservative content identity
  │
  ├─ text SimHash --------------------- related-version discovery only
  │
  ├─ page pHash + dHash --------------- presentation similarity evidence
  │
  └─ Ed25519-signed HPS claim
             │
             ▼
      TRANSFORMED FILE
             │
             ├─ exact SHA changed? yes
             ├─ canonical text same?
             ├─ page count same?
             ├─ visual fingerprints close?
             │
             ▼
      CLASSIFICATION
             │
             ├─ VERIFIED DERIVATIVE
             ├─ DERIVATIVE CANDIDATE
             ├─ MODIFIED DERIVATIVE
             └─ UNVERIFIED
```

## Why this is safer than one fuzzy hash

A fuzzy/perceptual hash can tolerate compression, but it can also tolerate small malicious edits. HPS therefore uses a hierarchy:

1. exact SHA-256
2. exact canonical-text SHA-256
3. structural/page evidence
4. perceptual visual evidence
5. approximate text similarity only for discovery / modified-derivative classification

No lower-confidence layer is allowed to overrule a contradiction in a stronger layer.
