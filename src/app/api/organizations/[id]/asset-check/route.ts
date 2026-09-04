import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AssetFingerprintSchema } from "@/lib/hps/schema";
import { compareAssetFingerprints } from "@/lib/hps/fingerprint-compare";

async function authorize(orgId: string) {
  const s = await createServerSupabase();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };

  const a = createAdminSupabase();
  const { data: member } = await a
    .from("hps_org_members")
    .select("role,status")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!member || member.status !== "active" || !["admin", "issuer"].includes(member.role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Authorized issuer role required." }, { status: 403 }) };
  }

  return { ok: true as const, admin: a };
}

async function exactMatches(admin: ReturnType<typeof createAdminSupabase>, orgId: string, hash: string) {
  const { data, error } = await admin
    .from("hps_records")
    .select("id,title,creator_name,issuer_org_id,status,version,asset_hash,superseded_by_id")
    .eq("record_kind", "institutional_document")
    .eq("asset_hash", hash)
    .in("status", ["active", "superseded"]);

  if (error) throw error;
  const rows = data ?? [];
  return {
    matches: rows,
    sameOrganization: rows.filter(row => row.issuer_org_id === orgId),
    otherOrganizations: rows.filter(row => row.issuer_org_id !== orgId),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const hash = new URL(req.url).searchParams.get("hash")?.toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return NextResponse.json({ error: "Valid SHA-256 hash required." }, { status: 400 });
    }

    const auth = await authorize(id);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await exactMatches(auth.admin, id, hash));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to check existing institutional provenance." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorize(id);
    if (!auth.ok) return auth.response;

    const parsed = AssetFingerprintSchema.safeParse((await req.json())?.fingerprint);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid HPS asset fingerprint is required.", details: parsed.error.issues }, { status: 400 });
    }

    const candidate = parsed.data;
    const exact = await exactMatches(auth.admin, id, candidate.exactSha256.toLowerCase());

    const candidates = new Map<string, any>();

    if (candidate.canonicalTextSha256) {
      const { data } = await auth.admin
        .from("hps_records")
        .select("id,title,creator_name,issuer_org_id,status,version,asset_hash,superseded_by_id,asset_fingerprint")
        .eq("record_kind", "institutional_document")
        .eq("canonical_text_sha256", candidate.canonicalTextSha256)
        .not("asset_fingerprint", "is", null)
        .in("status", ["active", "superseded"])
        .limit(100);
      (data || []).forEach((row: any) => candidates.set(row.id, row));
    }

    const { data: recent } = await auth.admin
      .from("hps_records")
      .select("id,title,creator_name,issuer_org_id,status,version,asset_hash,superseded_by_id,asset_fingerprint")
      .eq("record_kind", "institutional_document")
      .not("asset_fingerprint", "is", null)
      .in("status", ["active", "superseded"])
      .order("created_at", { ascending: false })
      .limit(250);
    (recent || []).forEach((row: any) => candidates.set(row.id, row));

    const relatedMatches = [...candidates.values()]
      .filter(row => row.asset_hash !== candidate.exactSha256)
      .flatMap((row: any) => {
        const original = AssetFingerprintSchema.safeParse(row.asset_fingerprint);
        if (!original.success) return [];
        const comparison = compareAssetFingerprints(original.data, candidate);
        if (comparison.status === "unverified") return [];
        return [{
          id: row.id,
          title: row.title,
          creator_name: row.creator_name,
          issuer_org_id: row.issuer_org_id,
          status: row.status,
          version: row.version,
          asset_hash: row.asset_hash,
          superseded_by_id: row.superseded_by_id,
          comparison,
        }];
      })
      .sort((a: any, b: any) => (b.comparison?.confidenceScore || 0) - (a.comparison?.confidenceScore || 0))
      .slice(0, 20);

    return NextResponse.json({
      ...exact,
      relatedMatches,
      sameOrganizationRelated: relatedMatches.filter((row: any) => row.issuer_org_id === id),
      otherOrganizationRelated: relatedMatches.filter((row: any) => row.issuer_org_id !== id),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to check cross-format provenance." }, { status: 500 });
  }
}
