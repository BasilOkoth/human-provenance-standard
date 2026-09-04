import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const hash =
    new URL(req.url).searchParams.get("hash")?.toLowerCase() ?? "";

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json(
      { error: "Valid SHA-256 hash required." },
      { status: 400 }
    );
  }

  const s = await createServerSupabase();
  const {
    data: { user }
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const a = createAdminSupabase();

  const { data: member } = await a
    .from("hps_org_members")
    .select("role,status")
    .eq("org_id", id)
    .eq("user_id", user.id)
    .single();

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

  const { data, error } = await a
    .from("hps_records")
    .select(
      "id,title,creator_name,issuer_org_id,status,version,asset_hash,superseded_by_id"
    )
    .eq("record_kind", "institutional_document")
    .eq("asset_hash", hash)
    .in("status", ["active", "superseded"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  return NextResponse.json({
    matches: rows,
    sameOrganization: rows.filter(row => row.issuer_org_id === id),
    otherOrganizations: rows.filter(row => row.issuer_org_id !== id)
  });
}
