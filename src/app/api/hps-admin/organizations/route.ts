import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireHpsAdmin } from "@/lib/hps/admin-auth";

const ALLOWED_STATUSES = new Set(["pending", "verified", "rejected", "suspended"]);

export async function GET() {
  const auth = await requireHpsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminSupabase();

  const { data: organizations, error } = await admin
    .from("hps_organizations")
    .select(
      "id,slug,name,verification_status,verified_at,verified_by,created_by,created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orgIds = (organizations ?? []).map((org) => org.id);

  let reviews: any[] = [];
  if (orgIds.length) {
    const { data, error: reviewError } = await admin
      .from("hps_org_verification_reviews")
      .select("id,org_id,reviewer_user_id,previous_status,decision,note,created_at")
      .in("org_id", orgIds)
      .order("created_at", { ascending: false });

    if (reviewError) {
      return NextResponse.json({ error: reviewError.message }, { status: 500 });
    }
    reviews = data ?? [];
  }

  const reviewMap = new Map<string, any[]>();
  for (const review of reviews) {
    const list = reviewMap.get(review.org_id) ?? [];
    list.push(review);
    reviewMap.set(review.org_id, list);
  }

  return NextResponse.json({
    organizations: (organizations ?? []).map((org) => ({
      ...org,
      reviews: reviewMap.get(org.id) ?? [],
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireHpsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const status = typeof body.status === "string" ? body.status : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";

  if (!orgId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid organization or decision." }, { status: 400 });
  }

  if ((status === "rejected" || status === "suspended") && note.length < 5) {
    return NextResponse.json(
      { error: "A review note is required for rejection or suspension." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();

  const { data: existing, error: existingError } = await admin
    .from("hps_organizations")
    .select("id,name,verification_status")
    .eq("id", orgId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const update: Record<string, any> = {
    verification_status: status,
  };

  if (status === "verified") {
    update.verified_at = new Date().toISOString();
    update.verified_by = auth.user.id;
  } else {
    update.verified_at = null;
    update.verified_by = null;
  }

  const { data: organization, error: updateError } = await admin
    .from("hps_organizations")
    .update(update)
    .eq("id", orgId)
    .select("id,slug,name,verification_status,verified_at,verified_by,created_by,created_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: reviewError } = await admin
    .from("hps_org_verification_reviews")
    .insert({
      org_id: orgId,
      reviewer_user_id: auth.user.id,
      previous_status: existing.verification_status,
      decision: status,
      note: note || null,
    });

  if (reviewError) {
    return NextResponse.json(
      {
        error:
          "Organization status changed, but the audit entry could not be written: " +
          reviewError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ organization });
}
