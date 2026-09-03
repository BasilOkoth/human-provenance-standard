import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const MAX_BYTES = 20 * 1024 * 1024;
const hashBytes = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

export async function GET(_req: NextRequest,{ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createAdminSupabase();
  const { data: record } = await admin.from("hps_records").select("id,owner_user_id").eq("id", id).single();
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  if (record.owner_user_id !== user.id) return NextResponse.json({ error: "Only the record owner can view private evidence." }, { status: 403 });
  const { data, error } = await admin.from("hps_creator_evidence").select("id,evidence_id,evidence_type,visibility,file_name,mime_type,file_size,sha256,note,created_at").eq("record_id", id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evidence: data ?? [] });
}

export async function POST(req: NextRequest,{ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createAdminSupabase();
  const { data: record, error: recordError } = await admin.from("hps_records").select("id,owner_user_id,manifest").eq("id", id).single();
  if (recordError || !record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  if (record.owner_user_id !== user.id) return NextResponse.json({ error: "Only the record owner can upload evidence." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  const evidenceId = String(form.get("evidenceId") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "Evidence file is required." }, { status: 400 });
  if (!evidenceId) return NextResponse.json({ error: "Evidence ID is required." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Evidence file must be 20 MB or smaller." }, { status: 400 });
  const signedEvidence = record.manifest?.creatorClaim?.supportingEvidence?.find((item: any) => item.id === evidenceId);
  if (!signedEvidence) return NextResponse.json({ error: "This evidence item is not part of the creator-signed provenance claim." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = hashBytes(bytes);
  if (sha256.toLowerCase() !== String(signedEvidence.sha256).toLowerCase()) return NextResponse.json({ error: "Evidence file hash does not match the creator-signed evidence fingerprint." }, { status: 409 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
  const storagePath = signedEvidence.visibility === "sealed" ? `${user.id}/${id}/${evidenceId}-${safeName}` : null;
  if (storagePath) {
    const { error: uploadError } = await admin.storage.from("hps-creator-evidence").upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }
  const { data, error } = await admin.from("hps_creator_evidence").insert({ record_id: id, owner_user_id: user.id, evidence_id: evidenceId, evidence_type: signedEvidence.type, visibility: signedEvidence.visibility, file_name: signedEvidence.fileName || file.name, mime_type: file.type || "application/octet-stream", file_size: file.size, sha256, storage_path: storagePath, note: signedEvidence.note || null }).select("id,evidence_id,evidence_type,visibility,file_name,mime_type,file_size,sha256,note,created_at").single();
  if (error) { if (storagePath) await admin.storage.from("hps-creator-evidence").remove([storagePath]); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json({ evidence: data }, { status: 201 });
}
