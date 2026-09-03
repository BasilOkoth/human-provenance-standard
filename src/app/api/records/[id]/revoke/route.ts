import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const reason = String(body.reason || "").trim().slice(0, 1000);

  if (reason.length < 5) {
    return NextResponse.json(
      { error: "A clear revocation reason is required." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();

  const { data: record, error: recordError } = await admin
    .from("hps_records")
    .select("id,status,owner_user_id,issuer_org_id")
    .eq("id", id)
    .single();

  if (recordError || !record) {
    return NextResponse.json(
      { error: "Record not found." },
      { status: 404 }
    );
  }

  if (record.status === "revoked") {
    return NextResponse.json(
      { error: "This record has already been revoked." },
      { status: 409 }
    );
  }

  if (record.status !== "active") {
    return NextResponse.json(
      { error: `Only active records can be revoked. Current status: ${record.status}.` },
      { status: 409 }
    );
  }

  let allowed = record.owner_user_id === user.id;

  if (!allowed && record.issuer_org_id) {
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
      {
        error:
          "Only the record owner or an authorized institutional issuer may revoke this record.",
      },
      { status: 403 }
    );
  }

  const revokedAt = new Date().toISOString();

  const { error } = await admin
    .from("hps_records")
    .update({
      status: "revoked",
      revoked_at: revokedAt,
      revocation_reason: reason,
    })
    .eq("id", id)
    .eq("status", "active");

  if (error) {
    return NextResponse.json(
      { error: "Unable to revoke record." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    revoked: true,
    recordId: id,
    status: "revoked",
    revokedAt,
    reason,
  });
}
