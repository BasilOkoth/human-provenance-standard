# Human Provenance Standard (HPS)

> **Proof of human contribution in an AI-assisted world.**

HPS is an experimental open standard for declaring, evidencing and verifying meaningful human contribution to digital and physical work.

It is not an AI detector. It is a provenance layer.

## Repository contents

- `schemas/` — draft standard schema
- `src/lib/hps/` — TypeScript reference implementation
- `scripts/` — key generation, signing and verification
- `examples/` — sample provenance manifest
- `docs/SPEC.md` — draft normative specification
- `src/app/` — premium Next.js reference interface

## Quick start

```bash
npm install
npm run dev
```

## Sign and verify the example

```bash
npm run keygen
npm run sign:example
npm run verify:example
```

Never commit `hps-keypair.json`.

## Long-term direction

HPS is intended to complement:
- C2PA Content Credentials
- W3C Verifiable Credentials
- cryptographic transparency logs
- institutional identity systems

**HPS 0.1 is a draft and is not yet an accredited international standard.**
