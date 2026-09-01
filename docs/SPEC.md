# Human Provenance Standard (HPS) v0.1 — Draft

**Status:** Experimental draft  
**Tagline:** Proof of human contribution.

## Purpose
HPS defines an open, machine-readable format for declaring, evidencing and verifying meaningful human contribution to digital and physical work in AI-assisted environments.

HPS MUST NOT be used as an AI detector or as a binary quality label.

## Required manifest fields
A conforming HPS manifest MUST contain:
1. `hpsVersion`
2. `id`
3. `work`
4. `actors`
5. `contributions`
6. `responsibility`
7. `issuedAt`

Signed manifests SHOULD additionally contain `issuer` and `signature`.

## Contribution origins
- `human`
- `ai_assisted`
- `automated`

These are process descriptions, not quality rankings.

## Evidence
Evidence MAY be:
- `public`
- `hashed`
- `sealed`

## Identity assurance
- `self_declared`
- `account_verified`
- `identity_verified`
- `institutionally_attested`

## Cryptography
HPS v0.1 RECOMMENDS SHA-256 fingerprints and Ed25519 signatures over canonical JSON.

## Verification
A verifier SHOULD report schema validity, signature validity, identity assurance, evidence status and contribution composition.

A verifier MUST NOT collapse these into a single authenticity score.

## Interoperability
Future HPS versions SHOULD define mappings for C2PA Content Credentials and W3C Verifiable Credentials.
