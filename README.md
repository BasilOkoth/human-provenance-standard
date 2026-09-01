# Human Provenance Standard — HPS 0.4 Identity & Attestation

> **Provenance with identity and agency.**

HPS 0.4 upgrades the reference implementation from registry-only signing to a dual-signature trust model.

## New in 0.4

- Supabase authentication
- email magic-link login
- GitHub OAuth support
- creator profiles
- creator-held Ed25519 signing keys
- PBKDF2 + AES-GCM encrypted key vault in the browser
- creator signature verification
- HPS Registry countersignature
- account-level identity assurance
- institutional assurance field
- third-party attestations
- record version lineage
- revocation without history erasure
- public QR provenance pages
- local SHA-256 asset verification

## Trust stack

1. Asset fingerprint
2. Creator key signature
3. Registry countersignature
4. Identity assurance
5. Evidence
6. Independent attestations
7. Version/revocation history

## Setup

Run:

```bash
npm install
```

Create a Supabase project and run:

```text
supabase/schema.sql
```

Generate registry keys:

```bash
npm run registry:keygen
```

Add `.env.local`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
HPS_REGISTRY_PUBLIC_KEY=YOUR_REGISTRY_PUBLIC_KEY
HPS_REGISTRY_SECRET_KEY=YOUR_REGISTRY_SECRET_KEY
```

## GitHub OAuth

In Supabase Authentication → Providers → GitHub:

1. Enable GitHub.
2. Create a GitHub OAuth App.
3. Use the callback URL shown by Supabase.
4. Add the OAuth client ID and secret in Supabase.
5. Add your Render URL under Authentication → URL Configuration.

## Security note

The browser reference key vault encrypts the creator secret key with a passphrase-derived AES-GCM key. This is a strong prototype architecture but not equivalent to hardware-backed key custody. High-assurance institutional deployments should support passkeys, WebAuthn, HSMs, or managed signing services.

HPS remains an experimental open draft and is not an accredited international standard.
