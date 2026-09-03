import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  signRegistryObject,
  verifyDetachedCanonical
} from "@/lib/hps/crypto";
import { jcsCanonicalize } from "@/lib/hps/canonical";

const BatchItemSchema = z.object({
  fileName: z.string().min(1).max(500),
  assetHash: z.string().regex(/^[a-f0-9]{64}$/i),
  status: z.enum(["issued", "duplicate", "failed"]),
  hpsId: z.string().min(8).optional(),
  message: z.string().max(1000).optional()
}).strict();

const BatchClaimSchema = z.object({
  version: z.literal("hps-institution-batch-1"),
  batchId: z.string().regex(/^HPS-BATCH-\d{4}-[A-Z0-9]{8,20}$/),
  organizationId: z.string().uuid(),
  organizationName: z.string().min(2).max(300),
  issuerPublicKey: z.string().min(20),
  issuerKeyId: z.string().uuid(),
  submittedCount: z.number().int().nonnegative(),
  issuedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  items: z.array(BatchItemSchema).min(1).max(5000),
  createdAt: z.string().datetime()
}).strict();

const RequestSchema = z.object({
  batchClaim: BatchClaimSchema,
  institutionSignature: z.string().min(20)
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = RequestSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid institutional batch.", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { batchClaim, institutionSignature } = parsed.data;

    if (batchClaim.organizationId !== id) {
      return NextResponse.json({ error: "Organization mismatch." }, { status: 400 });
    }

    if (batchClaim.items.length !== batchClaim.submittedCount) {
      return NextResponse.json(
        { error: "Submitted count does not match batch items." },
        { status: 400 }
      );
    }

    const issuedCount = batchClaim.items.filter(x => x.status === "issued").length;
    const duplicateCount = batchClaim.items.filter(x => x.status === "duplicate").length;
    const failedCount = batchClaim.items.filter(x => x.status === "failed").length;

    if (
      issuedCount !== batchClaim.issuedCount ||
      duplicateCount !== batchClaim.duplicateCount ||
      failedCount !== batchClaim.failedCount
    ) {
      return NextResponse.json(
        { error: "Batch result counts do not match batch items." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminSupabase();

    const [{ data: member }, { data: org }, { data: key }] = await Promise.all([
      admin
        .from("hps_org_members")
        .select("role,status")
        .eq("org_id", id)
        .eq("user_id", user.id)
        .single(),
      admin
        .from("hps_organizations")
        .select("id,name,verification_status")
        .eq("id", id)
        .single(),
      admin
        .from("hps_issuer_keys")
        .select("id,public_key,status")
        .eq("id", batchClaim.issuerKeyId)
        .eq("org_id", id)
        .eq("status", "active")
        .single()
    ]);

    if (
      !member ||
      member.status !== "active" ||
      !["admin", "issuer"].includes(member.role)
    ) {
      return NextResponse.json(
        { error: "Authorized issuer role required." },
        { status: 403 }
      );
    }

    if (!org || org.verification_status !== "verified") {
      return NextResponse.json(
        { error: "Institution must be verified before creating a batch record." },
        { status: 403 }
      );
    }

    if (org.name !== batchClaim.organizationName) {
      return NextResponse.json({ error: "Institution name mismatch." }, { status: 400 });
    }

    if (!key || key.public_key !== batchClaim.issuerPublicKey) {
      return NextResponse.json(
        { error: "Issuer key is not registered to this institution." },
        { status: 400 }
      );
    }

    if (
      !verifyDetachedCanonical(
        batchClaim,
        institutionSignature,
        batchClaim.issuerPublicKey
      )
    ) {
      return NextResponse.json(
        { error: "Institution batch signature verification failed." },
        { status: 400 }
      );
    }

    const { data: existingBatch } = await admin
      .from("hps_batches")
      .select("id")
      .eq("id", batchClaim.batchId)
      .maybeSingle();

    if (existingBatch) {
      return NextResponse.json({ error: "Batch ID already exists." }, { status: 409 });
    }

    const issuedItems = batchClaim.items.filter(
      x => x.status === "issued" && x.hpsId
    );

    if (issuedItems.length) {
      const ids = issuedItems.map(x => x.hpsId as string);

      const { data: records, error: recordsError } = await admin
        .from("hps_records")
        .select("id,asset_hash,issuer_org_id,status")
        .in("id", ids);

      if (recordsError) throw recordsError;

      const byId = new Map((records || []).map(r => [r.id, r]));

      for (const item of issuedItems) {
        const record = byId.get(item.hpsId as string);

        if (
          !record ||
          record.issuer_org_id !== id ||
          record.asset_hash.toLowerCase() !== item.assetHash.toLowerCase()
        ) {
          return NextResponse.json(
            {
              error: `Issued record ${item.hpsId} does not match this institution and asset.`
            },
            { status: 400 }
          );
        }
      }
    }

    const publicKey = process.env.HPS_REGISTRY_PUBLIC_KEY;
    const secretKey = process.env.HPS_REGISTRY_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return NextResponse.json(
        { error: "Registry signing unavailable." },
        { status: 503 }
      );
    }

    const batchDigest = createHash("sha256")
      .update(jcsCanonicalize(batchClaim))
      .digest("hex");

    const registryPayload = {
      version: "hps-batch-registry-envelope-1",
      batchClaim,
      institutionSignature,
      batchDigest,
      registryPublicKey: publicKey
    };

    const registrySignature = signRegistryObject(registryPayload, secretKey);

    const { error: batchError } = await admin.from("hps_batches").insert({
      id: batchClaim.batchId,
      org_id: id,
      created_by: user.id,
      issuer_key_id: batchClaim.issuerKeyId,
      issuer_public_key: batchClaim.issuerPublicKey,
      submitted_count: batchClaim.submittedCount,
      issued_count: batchClaim.issuedCount,
      duplicate_count: batchClaim.duplicateCount,
      failed_count: batchClaim.failedCount,
      batch_digest: batchDigest,
      institution_signature: institutionSignature,
      registry_signature: registrySignature,
      registry_public_key: publicKey,
      claim: batchClaim,
      status: "complete"
    });

    if (batchError) throw batchError;

    const rows = batchClaim.items.map(item => ({
      batch_id: batchClaim.batchId,
      file_name: item.fileName,
      asset_hash: item.assetHash.toLowerCase(),
      result_status: item.status,
      hps_record_id: item.hpsId || null,
      message: item.message || null
    }));

    const { error: itemError } = await admin
      .from("hps_batch_items")
      .insert(rows);

    if (itemError) {
      await admin.from("hps_batches").delete().eq("id", batchClaim.batchId);
      throw itemError;
    }

    return NextResponse.json(
      {
        id: batchClaim.batchId,
        batchDigest,
        institutionSignatureValid: true,
        registrySignature,
        registryPublicKey: publicKey,
        status: "complete"
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unable to create institutional batch record." },
      { status: 500 }
    );
  }
}
