import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Valid JSON body required." },
      { status: 400 }
    );
  }

  const replacementId =
    typeof body?.replacementId === "string"
      ? body.replacementId.trim()
      : "";

  if (!replacementId) {
    return NextResponse.json(
      { error: "Replacement HPS record ID is required." },
      { status: 400 }
    );
  }

  if (replacementId === id) {
    return NextResponse.json(
      { error: "A record cannot supersede itself." },
      { status: 400 }
    );
  }

  const a = createAdminSupabase();

  const { data: source, error: sourceError } = await a
    .from("hps_records")
    .select("id,owner_user_id,issuer_org_id,record_kind,status,superseded_by_id")
    .eq("id", id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json(
      { error: "Record not found." },
      { status: 404 }
    );
  }

  if (source.status !== "active") {
    return NextResponse.json(
      {
        error:
          source.status === "superseded"
            ? "This record is already superseded."
            : "Only an active record can be superseded."
      },
      { status: 409 }
    );
  }

  let allowed = source.owner_user_id === user.id;

  if (!allowed && source.issuer_org_id) {
    const { data: member } = await a
      .from("hps_org_members")
      .select("role,status")
      .eq("org_id", source.issuer_org_id)
      .eq("user_id", user.id)
      .single();

    allowed = Boolean(
      member &&
      member.status === "active" &&
      ["admin", "issuer"].includes(member.role)
    );
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "Not authorized." },
      { status: 403 }
    );
  }

  const { data: replacement, error: replacementError } = await a
    .from("hps_records")
    .select("id,owner_user_id,issuer_org_id,record_kind,status")
    .eq("id", replacementId)
    .single();

  if (replacementError || !replacement) {
    return NextResponse.json(
      { error: "Replacement record not found." },
      { status: 404 }
    );
  }

  if (replacement.status !== "active") {
    return NextResponse.json(
      { error: "The replacement record must be active." },
      { status: 409 }
    );
  }

  if (replacement.record_kind !== source.record_kind) {
    return NextResponse.json(
      {
        error:
          "The replacement must be the same HPS record type as the record being superseded."
      },
      { status: 400 }
    );
  }

  if (source.issuer_org_id) {
    if (replacement.issuer_org_id !== source.issuer_org_id) {
      return NextResponse.json(
        {
          error:
            "An institutional record can only be superseded by a record from the same institution."
        },
        { status: 400 }
      );
    }
  } else if (replacement.owner_user_id !== source.owner_user_id) {
    return NextResponse.json(
      {
        error:
          "A personal provenance record can only be superseded by a record owned by the same creator account."
      },
      { status: 400 }
    );
  }

  const { data: updated, error } = await a
    .from("hps_records")
    .update({
      status: "superseded",
      superseded_by_id: replacementId
    })
    .eq("id", id)
    .eq("status", "active")
    .select("id,status,superseded_by_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "The record changed before supersession completed. Refresh and try again."
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    superseded: true,
    recordId: id,
    replacementId
  });
}
