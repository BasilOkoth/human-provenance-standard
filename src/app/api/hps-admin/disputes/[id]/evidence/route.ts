import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

function isHpsAdmin(email?: string | null) {
  const allowed = (process.env.HPS_ADMIN_EMAILS || "")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user || !isHpsAdmin(user.email)) {
    return NextResponse.json(
      { error: "HPS administrator access required." },
      { status: 403 }
    );
  }

  const admin = createAdminSupabase();

  const { data: dispute } = await admin
    .from("hps_disputes")
    .select("id,record_id,category,statement,status,created_at")
    .eq("id", id)
    .single();

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  }

  const { data: record } = await admin
    .from("hps_records")
    .select("id,title,creator_name,asset_hash,status")
    .eq("id", dispute.record_id)
    .single();

  const { data: files, error } = await admin
    .from("hps_dispute_files")
    .select(
      "id,uploader_role,purpose,file_name,mime_type,file_size,sha256,registered_asset_hash,exact_asset_match,note,created_at"
    )
    .eq("dispute_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load dispute evidence." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    dispute,
    record,
    files: files || [],
    exactAssetSubmissions: (files || []).filter(file => file.exact_asset_match).length,
  });
}
