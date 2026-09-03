# HPS Institutional Batch v1

This adds a real cryptographically verifiable batch object above individual institutional HPS records.

## Install order

1. Run `supabase/migrations/20260903_140_institutional_batches.sql` in Supabase.
2. Add `src/app/api/organizations/[id]/batches/route.ts`.
3. Add `src/app/api/batches/[id]/route.ts`.
4. Add `src/app/batches/[id]/page.tsx`.
5. Update your bulk issuance page so that after individual records finish, it creates and signs one batch claim and POSTs it to `/api/organizations/${id}/batches`.

## Batch security semantics

`Batch integrity: valid` means all of the following:
- the stored batch claim still hashes to the stored SHA-256 batch digest;
- the institution's authorized Ed25519 issuer key verifies the signed batch claim;
- the HPS Registry Ed25519 key verifies the registry envelope;
- the batch is not void.

The batch does not replace individual HPS records.

## Client finalization snippet

After your bulk issuance loop has produced final item results, construct:

```ts
const batchId = `HPS-BATCH-${new Date().getUTCFullYear()}-${crypto
  .randomUUID()
  .replaceAll("-", "")
  .slice(0, 10)
  .toUpperCase()}`;

const batchItems = finalItems.map(item => ({
  fileName: item.fileName,
  assetHash: item.hash,
  status:
    item.status === "issued"
      ? "issued"
      : item.status === "same_org" || item.status === "other_org"
      ? "duplicate"
      : "failed",
  hpsId: item.hpsId || undefined,
  message: item.message || undefined
}));

const batchClaim = {
  version: "hps-institution-batch-1" as const,
  batchId,
  organizationId: id,
  organizationName: org.name,
  issuerPublicKey: pk,
  issuerKeyId: keyId,
  submittedCount: batchItems.length,
  issuedCount: batchItems.filter(x => x.status === "issued").length,
  duplicateCount: batchItems.filter(x => x.status === "duplicate").length,
  failedCount: batchItems.filter(x => x.status === "failed").length,
  items: batchItems,
  createdAt: new Date().toISOString()
};

const signedBatch = await signIssuerClaim(id, batchClaim, pass);

const batchResponse = await fetch(`/api/organizations/${id}/batches`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    batchClaim,
    institutionSignature: signedBatch.signature
  })
});

const batchData = await batchResponse.json();

if (!batchResponse.ok) {
  throw new Error(batchData.error || "Unable to create batch record.");
}

// batchData.id is the new HPS-BATCH-...
```

Then link the user to:

`/batches/${batchData.id}`

Important: keep the issuer passphrase in memory until both the individual records and the batch claim have been signed. Clear it only after the batch is finalized.
