import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verifyDetachedCanonical } from "@/lib/hps/crypto";
import { jcsCanonicalize } from "@/lib/hps/canonical";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminSupabase();

  const { data: batch, error } = await admin
    .from("hps_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !batch) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  const { data: items, error: itemError } = await admin
    .from("hps_batch_items")
    .select("file_name,asset_hash,result_status,hps_record_id,message")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  if (itemError) {
    return NextResponse.json({ error: "Unable to load batch items." }, { status: 500 });
  }

  const digest = createHash("sha256")
    .update(jcsCanonicalize(batch.claim))
    .digest("hex");

  const institutionSignatureValid = verifyDetachedCanonical(
    batch.claim,
    batch.institution_signature,
    batch.issuer_public_key
  );

  const registryPayload = {
    version: "hps-batch-registry-envelope-1",
    batchClaim: batch.claim,
    institutionSignature: batch.institution_signature,
    batchDigest: batch.batch_digest,
    registryPublicKey: batch.registry_public_key
  };

  const registrySignatureValid = verifyDetachedCanonical(
    registryPayload,
    batch.registry_signature,
    batch.registry_public_key
  );

  return NextResponse.json({
    batch: {
      id: batch.id,
      status: batch.status,
      orgId: batch.org_id,
      submittedCount: batch.submitted_count,
      issuedCount: batch.issued_count,
      duplicateCount: batch.duplicate_count,
      failedCount: batch.failed_count,
      batchDigest: batch.batch_digest,
      issuerPublicKey: batch.issuer_public_key,
      registryPublicKey: batch.registry_public_key,
      createdAt: batch.created_at,
      claim: batch.claim
    },
    items: items || [],
    integrity: {
      digestMatches: digest === batch.batch_digest,
      institutionSignatureValid,
      registrySignatureValid,
      valid:
        digest === batch.batch_digest &&
        institutionSignatureValid &&
        registrySignatureValid &&
        batch.status === "complete"
    }
  });
}
