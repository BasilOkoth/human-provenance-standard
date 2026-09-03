import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

function isHpsAdmin(email?: string | null) {
  const allowed = (process.env.HPS_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;

  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const admin = createAdminSupabase();

  const { data: dispute } = await admin
    .from("hps_disputes")
    .select("id,record_id,submitted_by")
    .eq("id", id)
    .single();

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  }

  const { data: record } = await admin
    .from("hps_records")
    .select("owner_user_id,issuer_org_id")
    .eq("id", dispute.record_id)
    .single();

  let allowed =
    dispute.submitted_by === user.id ||
    record?.owner_user_id === user.id ||
    isHpsAdmin(user.email);

  if (!allowed && record?.issuer_org_id) {
    const { data: membership } = await admin
      .from("hps_org_members")
      .select("role,status")
      .eq("org_id", record.issuer_org_id)
      .eq("user_id", user.id)
      .single();

    allowed = Boolean(
      membership &&
        membership.status === "active" &&
        ["admin", "issuer"].includes(membership.role)
    );
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "You are not authorized to access this private evidence." },
      { status: 403 }
    );
  }

  const { data: item } = await admin
    .from("hps_dispute_files")
    .select("id,storage_path,file_name")
    .eq("id", fileId)
    .eq("dispute_id", id)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Evidence file not found." }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from("hps-dispute-evidence")
    .createSignedUrl(item.storage_path, 60);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "Unable to create private evidence link." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
