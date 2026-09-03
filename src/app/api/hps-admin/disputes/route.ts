import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

function isHpsAdmin(email?: string | null) {
  const allowed = (process.env.HPS_ADMIN_EMAILS || "")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isHpsAdmin(user.email)) {
    return NextResponse.json({ error: "HPS administrator access required." }, { status: 403 });
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("hps_disputes")
    .select(`
      id,record_id,submitted_by,category,statement,evidence_url,status,
      reviewer_user_id,review_note,created_at,updated_at,resolved_at
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: "Unable to load disputes." }, { status: 500 });
  }

  return NextResponse.json({ disputes: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isHpsAdmin(user.email)) {
    return NextResponse.json({ error: "HPS administrator access required." }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const disputeId = String(body.disputeId || "");
  const action = String(body.action || "");
  const reviewNote = String(body.reviewNote || "").trim().slice(0, 5000);

  if (!disputeId) {
    return NextResponse.json({ error: "Dispute ID is required." }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: dispute } = await admin
    .from("hps_disputes")
    .select("*")
    .eq("id", disputeId)
    .single();

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  }

  const { data: record } = await admin
    .from("hps_records")
    .select("id,status")
    .eq("id", dispute.record_id)
    .single();

  if (!record) {
    return NextResponse.json({ error: "Associated record not found." }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (action === "start_review") {
    if (!["open"].includes(dispute.status)) {
      return NextResponse.json({ error: "Only open disputes can enter review." }, { status: 409 });
    }

    const fromStatus = record.status;

    const { error: disputeError } = await admin
      .from("hps_disputes")
      .update({
        status: "under_review",
        reviewer_user_id: user.id,
        review_note: reviewNote || null,
        updated_at: now,
      })
      .eq("id", disputeId);

    if (disputeError) {
      return NextResponse.json({ error: "Unable to start review." }, { status: 500 });
    }

    if (record.status === "active") {
      await admin.from("hps_records")
        .update({ status: "under_review" })
        .eq("id", record.id);

      await admin.from("hps_record_status_events").insert({
        record_id: record.id,
        from_status: fromStatus,
        to_status: "under_review",
        actor_user_id: user.id,
        reason: reviewNote || "A submitted provenance dispute was accepted for review.",
        dispute_id: disputeId,
      });
    }

    return NextResponse.json({ ok: true, disputeStatus: "under_review", recordStatus: "under_review" });
  }

  if (action === "dismiss") {
    if (!["open", "under_review"].includes(dispute.status)) {
      return NextResponse.json({ error: "This dispute is already resolved." }, { status: 409 });
    }

    await admin.from("hps_disputes")
      .update({
        status: "resolved_no_issue",
        reviewer_user_id: user.id,
        review_note: reviewNote || "No material provenance issue established.",
        updated_at: now,
        resolved_at: now,
      })
      .eq("id", disputeId);

    if (record.status === "under_review") {
      const { count } = await admin
        .from("hps_disputes")
        .select("id", { count: "exact", head: true })
        .eq("record_id", record.id)
        .eq("status", "under_review")
        .neq("id", disputeId);

      if (!count) {
        await admin.from("hps_records").update({ status: "active" }).eq("id", record.id);

        await admin.from("hps_record_status_events").insert({
          record_id: record.id,
          from_status: "under_review",
          to_status: "active",
          actor_user_id: user.id,
          reason: reviewNote || "Dispute resolved without finding a material provenance issue.",
          dispute_id: disputeId,
        });
      }
    }

    return NextResponse.json({ ok: true, disputeStatus: "resolved_no_issue" });
  }

  if (action === "misrepresentation") {
    if (!["open", "under_review"].includes(dispute.status)) {
      return NextResponse.json({ error: "This dispute is already resolved." }, { status: 409 });
    }

    if (reviewNote.length < 10) {
      return NextResponse.json(
        { error: "A review finding is required before recording misrepresentation." },
        { status: 400 }
      );
    }

    await admin.from("hps_disputes")
      .update({
        status: "misrepresentation_found",
        reviewer_user_id: user.id,
        review_note: reviewNote,
        updated_at: now,
        resolved_at: now,
      })
      .eq("id", disputeId);

    const fromStatus = record.status;

    await admin.from("hps_records")
      .update({
        status: "revoked",
        revoked_at: now,
        revocation_reason: `Misrepresentation found after dispute review: ${reviewNote}`.slice(0, 1000),
      })
      .eq("id", record.id);

    await admin.from("hps_record_status_events").insert({
      record_id: record.id,
      from_status: fromStatus,
      to_status: "revoked",
      actor_user_id: user.id,
      reason: reviewNote,
      dispute_id: disputeId,
    });

    return NextResponse.json({
      ok: true,
      disputeStatus: "misrepresentation_found",
      recordStatus: "revoked",
    });
  }

  return NextResponse.json({ error: "Unknown review action." }, { status: 400 });
}
