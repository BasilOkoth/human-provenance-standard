import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

const categories = new Set([
  "authorship",
  "ownership",
  "identity",
  "institutional_authority",
  "evidence",
  "ai_use_disclosure",
  "document_validity",
  "other",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const category = String(body.category || "");
  const statement = String(body.statement || "").trim().slice(0, 5000);
  const evidenceUrl = body.evidenceUrl ? String(body.evidenceUrl).trim().slice(0, 2000) : null;

  if (!categories.has(category)) {
    return NextResponse.json({ error: "Select a valid dispute category." }, { status: 400 });
  }

  if (statement.length < 20) {
    return NextResponse.json(
      { error: "Please explain the dispute in at least 20 characters." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();

  const { data: record } = await admin
    .from("hps_records")
    .select("id,status,owner_user_id")
    .eq("id", id)
    .single();

  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  if (record.status === "revoked") {
    return NextResponse.json(
      { error: "This record is already revoked. Its provenance history remains public." },
      { status: 409 }
    );
  }

  const { data: existing } = await admin
    .from("hps_disputes")
    .select("id,status")
    .eq("record_id", id)
    .eq("submitted_by", user.id)
    .in("status", ["open", "under_review"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "You already have an unresolved dispute for this record.", disputeId: existing.id },
      { status: 409 }
    );
  }

  const { data: dispute, error } = await admin
    .from("hps_disputes")
    .insert({
      record_id: id,
      submitted_by: user.id,
      category,
      statement,
      evidence_url: evidenceUrl,
      status: "open",
    })
    .select("id,status,created_at")
    .single();

  if (error || !dispute) {
    return NextResponse.json({ error: "Unable to submit dispute." }, { status: 500 });
  }

  // Do not automatically mark the record disputed merely because one person submits a claim.
  // Public disputed/under-review status begins when an authorized reviewer accepts it for review.
  return NextResponse.json({
    submitted: true,
    disputeId: dispute.id,
    status: dispute.status,
    createdAt: dispute.created_at,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .from("hps_disputes")
    .select("id,category,status,created_at,resolved_at")
    .eq("record_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Unable to read dispute status." }, { status: 500 });
  }

  return NextResponse.json({ disputes: data || [] });
}
