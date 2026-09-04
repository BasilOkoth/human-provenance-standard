import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AssetFingerprintSchema } from "@/lib/hps/schema";
import { compareAssetFingerprints } from "@/lib/hps/fingerprint-compare";
import { signRegistryObject } from "@/lib/hps/crypto";

const TransformationTypeSchema = z.enum([
  "compression",
  "optimization",
  "format_conversion",
  "digitization",
  "transcription",
  "resize",
  "metadata_stripped",
  "transmission",
  "other"
]);

const BodySchema = z.object({
  fingerprint: AssetFingerprintSchema,
  transformationType: TransformationTypeSchema,
  note: z.string().max(1000).optional(),
});

async function mayRegister(userId: string, record: any, admin: ReturnType<typeof createAdminSupabase>) {
  if (record.owner_user_id === userId && record.record_kind !== "institutional_document") return true;
  if (!record.issuer_org_id) return false;
  const { data: membership } = await admin
    .from("hps_org_members")
    .select("role,status")
    .eq("org_id", record.issuer_org_id)
    .eq("user_id", userId)
    .single();
  return Boolean(membership && membership.status === "active" && ["admin", "issuer"].includes(membership.role));
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("hps_registered_derivatives")
      .select("id,derivative_sha256,transformation_type,comparison,assurance,note,created_at")
      .eq("parent_record_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ derivatives: data || [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to load derivatives." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await createServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid derivative registration.", details: parsed.error.issues }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { data: record } = await admin
      .from("hps_records")
      .select("id,owner_user_id,issuer_org_id,record_kind,status,asset_fingerprint")
      .eq("id", id)
      .single();
    if (!record) return NextResponse.json({ error: "HPS record not found." }, { status: 404 });
    if (record.status === "revoked") {
      return NextResponse.json({ error: "A revoked record cannot register new derivatives." }, { status: 409 });
    }
    if (!(await mayRegister(user.id, record, admin))) {
      return NextResponse.json({ error: "You are not authorized to register derivatives for this record." }, { status: 403 });
    }

    const originalParsed = AssetFingerprintSchema.safeParse(record.asset_fingerprint);
    if (!originalParsed.success) {
      return NextResponse.json({
        error: "This record has no resilient HPS fingerprint. Re-issue or supersede it with an OCR/cross-format fingerprint first."
      }, { status: 409 });
    }

    const comparison = compareAssetFingerprints(originalParsed.data, parsed.data.fingerprint);
    const transformationType = parsed.data.transformationType;
    const explicitDocumentTransformation = transformationType === "digitization" || transformationType === "transcription";

    const strongCrossFormat =
      comparison.status === "cross_format_match" &&
      comparison.confidenceScore >= 75 &&
      (
        comparison.canonicalTextMatch === true ||
        comparison.contentCanonicalMatch === true ||
        (comparison.contentSimilarity ?? 0) >= 0.95
      );

    const allowed = comparison.status === "verified_derivative" || strongCrossFormat;

    if (!allowed) {
      return NextResponse.json({
        error: explicitDocumentTransformation
          ? "HPS does not have enough evidence to register this digitization/transcription relationship automatically. Review the comparison or add stronger source evidence."
          : "HPS cannot automatically register this file as a verified derivative.",
        comparison,
      }, { status: 409 });
    }

    const publicKey = process.env.HPS_REGISTRY_PUBLIC_KEY;
    const secretKey = process.env.HPS_REGISTRY_SECRET_KEY;
    if (!publicKey || !secretKey) {
      return NextResponse.json({ error: "Registry signing unavailable." }, { status: 503 });
    }

    const now = new Date().toISOString();
    const registryPayload = {
      hpsVersion: "1.2",
      type: "registered_derivative",
      parentRecordId: id,
      derivativeSha256: parsed.data.fingerprint.exactSha256,
      transformationType,
      fingerprintVersion: parsed.data.fingerprint.version,
      comparison,
      relationshipBasis: comparison.status === "cross_format_match" ? "cross_format_fingerprint" : "resilient_fingerprint",
      registeredBy: user.id,
      registeredAt: now,
    };
    const registrySignature = signRegistryObject(registryPayload, secretKey);

    const assurance = comparison.assurance === "high"
      ? "high"
      : comparison.assurance === "low"
        ? "low"
        : "medium";

    const { data, error } = await admin
      .from("hps_registered_derivatives")
      .upsert({
        parent_record_id: id,
        derivative_sha256: parsed.data.fingerprint.exactSha256,
        transformation_type: transformationType,
        derivative_fingerprint: parsed.data.fingerprint,
        comparison,
        assurance,
        note: parsed.data.note || null,
        registered_by: user.id,
        registry_payload: registryPayload,
        registry_signature: registrySignature,
        registry_public_key: publicKey,
      }, { onConflict: "parent_record_id,derivative_sha256" })
      .select("id,parent_record_id,derivative_sha256,transformation_type,comparison,assurance,created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ derivative: data, registrySignature }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to register derivative." }, { status: 500 });
  }
}
