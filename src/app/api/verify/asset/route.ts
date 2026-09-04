import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AssetFingerprintSchema, HPSManifestSchema } from "@/lib/hps/schema";
import { compareAssetFingerprints } from "@/lib/hps/fingerprint-compare";
import { verifyRegistrySignature, verifyDetachedCanonical } from "@/lib/hps/crypto";

const priority: Record<string, number> = {
  exact_original: 0,
  registered_derivative: 1,
  verified_derivative: 2,
  cross_format_match: 3,
  derivative_candidate: 4,
  modified_derivative: 5,
  unverified: 6,
};

function validateRecord(row: any) {
  const parsed = HPSManifestSchema.safeParse(row.manifest);
  if (!parsed.success) {
    return {
      validSchema: false,
      validRegistrySignature: false,
      creatorSignatureValid: false,
      institutionSignatureValid: false,
    };
  }
  const m = parsed.data;
  const creatorSignatureValid = Boolean(
    m.creatorClaim &&
    m.creatorSignature?.publicKey &&
    verifyDetachedCanonical(m.creatorClaim, m.creatorSignature.value, m.creatorSignature.publicKey)
  );
  const institutionSignatureValid = Boolean(
    m.institutionalClaim &&
    m.institutionSignature?.publicKey &&
    verifyDetachedCanonical(m.institutionalClaim, m.institutionSignature.value, m.institutionSignature.publicKey)
  );
  return {
    validSchema: true,
    validRegistrySignature: verifyRegistrySignature(m),
    creatorSignatureValid,
    institutionSignatureValid,
  };
}

function publicRecord(row: any, extra: Record<string, unknown> = {}) {
  const signatures = validateRecord(row);
  const signed = signatures.creatorSignatureValid || signatures.institutionSignatureValid;
  return {
    id: row.id,
    title: row.title,
    creatorName: row.creator_name,
    recordKind: row.record_kind,
    status: row.status,
    version: row.version,
    issuerOrgId: row.issuer_org_id,
    ...signatures,
    trustedProvenance: row.status === "active" && signatures.validRegistrySignature && signed,
    ...extra,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetHash = String(body.assetHash || body.fingerprint?.exactSha256 || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(assetHash)) {
      return NextResponse.json({ error: "A valid SHA-256 assetHash is required." }, { status: 400 });
    }

    const fingerprintParsed = body.fingerprint ? AssetFingerprintSchema.safeParse(body.fingerprint) : null;
    if (fingerprintParsed && !fingerprintParsed.success) {
      return NextResponse.json({ error: "Invalid HPS asset fingerprint.", details: fingerprintParsed.error.issues }, { status: 400 });
    }
    const candidate = fingerprintParsed?.success ? fingerprintParsed.data : null;
    if (candidate && candidate.exactSha256.toLowerCase() !== assetHash) {
      return NextResponse.json({ error: "assetHash does not match fingerprint.exactSha256." }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // 1) Exact original: SHA-256 is the strongest result.
    const { data: exactRows, error: exactError } = await admin
      .from("hps_records")
      .select("id,title,creator_name,record_kind,status,version,issuer_org_id,manifest,asset_fingerprint")
      .eq("asset_hash", assetHash)
      .order("created_at", { ascending: false })
      .limit(20);
    if (exactError) throw exactError;

    if ((exactRows || []).length) {
      const records = (exactRows || []).map(row => publicRecord(row, {
        verificationClass: row.status === "revoked" ? "revoked" : "exact_original",
        assurance: "cryptographic",
        confidenceScore: 100,
        confidenceBand: "very_high",
        comparison: {
          exactHashMatch: true,
          canonicalTextMatch: null,
          contentCanonicalMatch: null,
          reasons: ["The uploaded file is byte-for-byte identical to the registered SHA-256 asset."],
        },
      }));
      return NextResponse.json({ assetHash, match: true, matchMode: "exact", records });
    }

    // 2) Explicit registered derivative.
    const { data: derivativeRows } = await admin
      .from("hps_registered_derivatives")
      .select("parent_record_id,transformation_type,comparison,assurance,registry_payload,registry_signature,registry_public_key,created_at")
      .eq("derivative_sha256", assetHash)
      .order("created_at", { ascending: false })
      .limit(20);

    if ((derivativeRows || []).length) {
      const parentIds = [...new Set((derivativeRows || []).map((r: any) => r.parent_record_id))];
      const { data: parents } = await admin
        .from("hps_records")
        .select("id,title,creator_name,record_kind,status,version,issuer_org_id,manifest,asset_fingerprint")
        .in("id", parentIds);
      const parentMap = new Map((parents || []).map((r: any) => [r.id, r]));

      const records = (derivativeRows || []).flatMap((derivative: any) => {
        const parent: any = parentMap.get(derivative.parent_record_id);
        if (!parent) return [];
        const derivativeSignatureValid = Boolean(
          derivative.registry_payload && derivative.registry_signature && derivative.registry_public_key &&
          verifyDetachedCanonical(derivative.registry_payload, derivative.registry_signature, derivative.registry_public_key)
        );
        return [publicRecord(parent, {
          verificationClass: parent.status === "revoked" ? "revoked" : derivativeSignatureValid ? "registered_derivative" : "derivative_candidate",
          assurance: derivativeSignatureValid ? derivative.assurance : "none",
          confidenceScore: derivative.comparison?.confidenceScore ?? null,
          confidenceBand: derivative.comparison?.confidenceBand ?? null,
          transformationType: derivative.transformation_type,
          comparison: derivative.comparison,
          derivativeRegistrySignatureValid: derivativeSignatureValid,
        })];
      });

      if (records.length) {
        return NextResponse.json({ assetHash, match: true, matchMode: "registered_derivative", records });
      }
    }

    if (!candidate) {
      return NextResponse.json({ assetHash, match: false, matchMode: "none", records: [] });
    }

    const rowsById = new Map<string, any>();
    const select = "id,title,creator_name,record_kind,status,version,issuer_org_id,manifest,asset_fingerprint,canonical_text_sha256,content_canonical_sha256";

    // Strong candidate lookup: strict canonical text.
    if (candidate.canonicalTextSha256) {
      const { data: textRows } = await admin
        .from("hps_records")
        .select(select)
        .eq("canonical_text_sha256", candidate.canonicalTextSha256)
        .not("asset_fingerprint", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      (textRows || []).forEach((row: any) => rowsById.set(row.id, row));
    }

    // Cross-format lookup: representation-normalized content identity.
    if (candidate.contentCanonicalSha256) {
      const { data: contentRows } = await admin
        .from("hps_records")
        .select(select)
        .eq("content_canonical_sha256", candidate.contentCanonicalSha256)
        .not("asset_fingerprint", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      (contentRows || []).forEach((row: any) => rowsById.set(row.id, row));
    }

    // Bounded fallback pool for OCR errors, visual similarity and modified copies.
    const { data: recentRows } = await admin
      .from("hps_records")
      .select(select)
      .not("asset_fingerprint", "is", null)
      .order("created_at", { ascending: false })
      .limit(350);
    (recentRows || []).forEach((row: any) => rowsById.set(row.id, row));

    const compared = [...rowsById.values()]
      .flatMap((row: any) => {
        const originalParsed = AssetFingerprintSchema.safeParse(row.asset_fingerprint);
        if (!originalParsed.success) return [];
        const comparison = compareAssetFingerprints(originalParsed.data, candidate);
        if (comparison.status === "unverified") return [];
        return [publicRecord(row, {
          verificationClass: row.status === "revoked" ? "revoked" : comparison.status,
          assurance: comparison.assurance,
          confidenceScore: comparison.confidenceScore,
          confidenceBand: comparison.confidenceBand,
          comparison,
        })];
      })
      .sort((a: any, b: any) => {
        const pa = priority[a.verificationClass] ?? 99;
        const pb = priority[b.verificationClass] ?? 99;
        if (pa !== pb) return pa - pb;
        return (b.confidenceScore || 0) - (a.confidenceScore || 0);
      })
      .slice(0, 20);

    return NextResponse.json({
      assetHash,
      match: compared.length > 0,
      matchMode: compared.length ? "resilient" : "none",
      records: compared,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to verify asset." }, { status: 500 });
  }
}
