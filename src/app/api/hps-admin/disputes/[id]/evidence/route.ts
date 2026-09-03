import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  createHpsNotifications,
  disputeRecordHolderUserIds,
} from "@/lib/hps/notifications";

function isHpsAdmin(email?: string | null) {
  const allowed = (process.env.HPS_ADMIN_EMAILS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();

  if (!user || !isHpsAdmin(user.email))
    return NextResponse.json({ error: "HPS administrator access required." }, { status: 403 });

  const admin = createAdminSupabase();

  const { data: dispute } = await admin
    .from("hps_disputes")
    .select("id,record_id,submitted_by,category,statement,status,created_at,resolved_at")
    .eq("id", id)
    .single();

  if (!dispute)
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const { data: record } = await admin
    .from("hps_records")
    .select("id,title,creator_name,record_kind,asset_hash,status,owner_user_id,issuer_org_id")
    .eq("id", dispute.record_id)
    .single();

  const { data: files } = await admin
    .from("hps_dispute_files")
    .select("id,uploader_role,purpose,file_name,mime_type,file_size,sha256,exact_asset_match,note,created_at")
    .eq("dispute_id", id)
    .order("created_at", { ascending: true });

  const { data: requests } = await admin
    .from("hps_evidence_requests")
    .select("id,target_role,request_text,due_at,status,responded_at,closed_at,created_at")
    .eq("dispute_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    dispute,
    record,
    files: files || [],
    requests: requests || [],
    exactAssetSubmissions: (files || []).filter((file) => file.exact_asset_match).length,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();

  if (!user || !isHpsAdmin(user.email))
    return NextResponse.json({ error: "HPS administrator access required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const admin = createAdminSupabase();

  const { data: dispute } = await admin
    .from("hps_disputes")
    .select("id,record_id,submitted_by,status")
    .eq("id", id)
    .single();

  if (!dispute)
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const { data: record } = await admin
    .from("hps_records")
    .select("id,title,owner_user_id,issuer_org_id")
    .eq("id", dispute.record_id)
    .single();

  if (!record)
    return NextResponse.json({ error: "Record not found." }, { status: 404 });

  if (action === "request_evidence") {
    const targetRole = String(body.targetRole || "");
    const requestText = String(body.requestText || "").trim().slice(0, 5000);
    const dueAt = body.dueAt ? new Date(body.dueAt).toISOString() : null;

    if (!["challenger", "record_holder"].includes(targetRole))
      return NextResponse.json({ error: "Select who must respond." }, { status: 400 });

    if (requestText.length < 10)
      return NextResponse.json({ error: "Explain what additional evidence is required." }, { status: 400 });

    const { data: evidenceRequest, error } = await admin
      .from("hps_evidence_requests")
      .insert({
        dispute_id: id,
        record_id: dispute.record_id,
        requested_by: user.id,
        target_role: targetRole,
        request_text: requestText,
        due_at: dueAt,
        status: "open",
      })
      .select("id,target_role,request_text,due_at,status,created_at")
      .single();

    if (error || !evidenceRequest)
      return NextResponse.json({ error: "Unable to create evidence request." }, { status: 500 });

    const recipients =
      targetRole === "challenger"
        ? [dispute.submitted_by]
        : await disputeRecordHolderUserIds(record);

    try {
      await createHpsNotifications({
        userIds: recipients,
        notificationType: "evidence_requested",
        title: "Additional evidence requested for an HPS dispute",
        message:
          `An HPS reviewer has requested additional evidence for record ${record.id}. ` +
          requestText +
          (dueAt ? ` Requested response date: ${new Date(dueAt).toLocaleDateString()}.` : ""),
        href: `/disputes/${id}`,
      });
    } catch {}

    return NextResponse.json({ ok: true, request: evidenceRequest });
  }

  if (action === "close_request") {
    const requestId = String(body.requestId || "");
    if (!requestId)
      return NextResponse.json({ error: "Request ID required." }, { status: 400 });

    await admin
      .from("hps_evidence_requests")
      .update({ status: "satisfied", closed_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("dispute_id", id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
