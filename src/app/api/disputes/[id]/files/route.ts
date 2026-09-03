import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const allowedPurposes = new Set([
  "supporting_evidence",
  "original_asset",
  "response_evidence",
]);

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "evidence.bin";
}

async function getAccess(disputeId: string, userId: string) {
  const admin = createAdminSupabase();

  const { data: dispute } = await admin
    .from("hps_disputes")
    .select("id,record_id,submitted_by,status")
    .eq("id", disputeId)
    .single();

  if (!dispute) return null;

  const { data: record } = await admin
    .from("hps_records")
    .select("id,owner_user_id,issuer_org_id,asset_hash,status")
    .eq("id", dispute.record_id)
    .single();

  if (!record) return null;

  if (dispute.submitted_by === userId) {
    return { admin, dispute, record, role: "challenger" as const };
  }

  if (record.owner_user_id === userId) {
    return { admin, dispute, record, role: "record_holder" as const };
  }

  if (record.issuer_org_id) {
    const { data: membership } = await admin
      .from("hps_org_members")
      .select("role,status")
      .eq("org_id", record.issuer_org_id)
      .eq("user_id", userId)
      .single();

    if (
      membership &&
      membership.status === "active" &&
      ["admin", "issuer"].includes(membership.role)
    ) {
      return { admin, dispute, record, role: "record_holder" as const };
    }
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const access = await getAccess(id, user.id);

  if (!access) {
    return NextResponse.json(
      { error: "You are not authorized to view this dispute evidence." },
      { status: 403 }
    );
  }

  const { data, error } = await access.admin
    .from("hps_dispute_files")
    .select(
      "id,uploader_role,purpose,file_name,mime_type,file_size,sha256,registered_asset_hash,exact_asset_match,note,created_at"
    )
    .eq("dispute_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Unable to load dispute evidence." }, { status: 500 });
  }

  return NextResponse.json({
    disputeId: id,
    recordId: access.dispute.record_id,
    disputeStatus: access.dispute.status,
    viewerRole: access.role,
    registeredAssetHash: access.record.asset_hash,
    files: data || [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const access = await getAccess(id, user.id);

  if (!access) {
    return NextResponse.json(
      { error: "You are not authorized to upload evidence to this dispute." },
      { status: 403 }
    );
  }

  if (!["open", "under_review"].includes(access.dispute.status)) {
    return NextResponse.json(
      { error: "This dispute is no longer accepting evidence." },
      { status: 409 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const purpose = String(form.get("purpose") || "").trim();
  const note = String(form.get("note") || "").trim().slice(0, 2000) || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  if (!allowedPurposes.has(purpose)) {
    return NextResponse.json({ error: "Select a valid evidence purpose." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Each dispute file must be 25 MB or smaller." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = sha256(bytes).toLowerCase();
  const registeredHash = String(access.record.asset_hash || "").toLowerCase();
  const exactAssetMatch = Boolean(
    registeredHash &&
      /^[0-9a-f]{64}$/.test(registeredHash) &&
      digest === registeredHash
  );

  const evidenceId = crypto.randomUUID();
  const safeName = safeFileName(file.name);
  const storagePath = `${id}/${access.role}/${user.id}/${evidenceId}-${safeName}`;

  const { error: uploadError } = await access.admin.storage
    .from("hps-dispute-evidence")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error } = await access.admin
    .from("hps_dispute_files")
    .insert({
      id: evidenceId,
      dispute_id: id,
      record_id: access.dispute.record_id,
      uploaded_by: user.id,
      uploader_role: access.role,
      purpose,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      sha256: digest,
      registered_asset_hash: registeredHash || null,
      exact_asset_match: exactAssetMatch,
      storage_path: storagePath,
      note,
    })
    .select(
      "id,uploader_role,purpose,file_name,mime_type,file_size,sha256,registered_asset_hash,exact_asset_match,note,created_at"
    )
    .single();

  if (error || !data) {
    await access.admin.storage.from("hps-dispute-evidence").remove([storagePath]);
    return NextResponse.json({ error: "Unable to preserve dispute evidence." }, { status: 500 });
  }

  return NextResponse.json(
    {
      evidence: data,
      verification: exactAssetMatch
        ? {
            exactRegisteredAsset: true,
            message: "SHA-256 exact match with the asset registered in this HPS record.",
          }
        : {
            exactRegisteredAsset: false,
            message: "This file does not exactly match the registered asset hash.",
          },
    },
    { status: 201 }
  );
}
