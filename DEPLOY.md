# HPS 0.4 — Render Deployment

## 1. Supabase

Create a project and run `supabase/schema.sql`.

Copy:
- Project URL
- anon/public key
- service role key

## 2. Authentication URL configuration

In Supabase Authentication → URL Configuration:

Site URL:
```text
https://human-provenance-standard.onrender.com
```

Redirect URLs:
```text
https://human-provenance-standard.onrender.com/auth/callback
http://localhost:3000/auth/callback
```

## 3. GitHub OAuth (optional but recommended)

Enable the GitHub provider in Supabase and follow the callback URL that Supabase supplies.

## 4. Registry keys

```bash
npm install
npm run registry:keygen
```

## 5. Render variables

```text
NODE_VERSION=22
NEXT_PUBLIC_APP_URL=https://human-provenance-standard.onrender.com
NEXT_PUBLIC_SUPABASE_URL=<project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
HPS_REGISTRY_PUBLIC_KEY=<generated public key>
HPS_REGISTRY_SECRET_KEY=<generated secret key>
```

Build:
```bash
npm ci && npm run build
```

Start:
```bash
npm start
```

## 6. Test sequence

1. Sign in at `/login`.
2. Open `/account`.
3. Create a creator signing key and back it up.
4. Open `/create`.
5. Upload a test file.
6. Enter your creator-key passphrase and register the record.
7. Confirm the public page shows creator signature + registry signature.
8. Add a second account and add an attestation.
9. Verify the manifest at `/verify`.
10. Re-upload the original file and confirm the SHA-256 match.
