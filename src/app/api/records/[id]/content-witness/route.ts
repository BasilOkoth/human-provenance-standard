import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ContentIntegrityWitnessSchema } from "@/lib/hps/content-witness-schema";
import { signRegistryObject, verifyDetachedCanonical } from "@/lib/hps/crypto";

const BodySchema = z.object({
  assetHash: z.string().regex(/^[a-f0-9]{64}$/i),
  witness: ContentIntegrityWitnessSchema,
  disclosureAccepted: z.literal(true),
});

async function mayRegister(
  userId: string,
  record: any,
  admin: ReturnType<typeof createAdminSupabase>
) {
  if (record.owner_user_id === userId && record.record_kind !== "institutional_document") {
    return true;
  }

  if (!record.issuer_org_id) return false;

  const { data: membership } = await admin
    .from("hps_org_members")
    .select("role,status")
    .eq("org_id", record.issuer_org_id)
    .eq("user_id", userId)
    .single();

  return Boolean(
    membership &&
    membership.status === "active" &&
    ["admin", "issuer"].includes(membership.role)
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminSupabase();

    const { data, error } = await admin
      .from("hps_content_witnesses")
      .select(
        "record_id,asset_hash,mode,witness,registry_payload,registry_signature,registry_public_key,created_at,updated_at"
      )
      .eq("record_id", id)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (!data) {
      return NextResponse.json({ enabled: false, recordId: id });
    }

    const validRegistrySignature = Boolean(
      data.registry_payload &&
      data.registry_signature &&
      data.registry_public_key &&
      verifyDetachedCanonical(
        data.registry_payload,
        data.registry_signature,
        data.registry_public_key
      )
    );

    return NextResponse.json({
      enabled: true,
      recordId: id,
      mode: data.mode,
      entryCount: Array.isArray(data.witness?.entries)
        ? data.witness.entries.length
        : 0,
      truncated: Boolean(data.witness?.truncated),
      validRegistrySignature,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unable to load the content integrity witness." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await createServerSupabase();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid content integrity witness.",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();

    const { data: record, error: recordError } = await admin
      .from("hps_records")
      .select(
        "id,owner_user_id,issuer_org_id,record_kind,status,asset_hash,title"
      )
      .eq("id", id)
      .single();

    if (recordError || !record) {
      return NextResponse.json(
        { error: "HPS record not found." },
        { status: 404 }
      );
    }

    if (record.status === "revoked") {
      return NextResponse.json(
        { error: "A revoked record cannot register a content integrity witness." },
        { status: 409 }
      );
    }

    if (!(await mayRegister(user.id, record, admin))) {
      return NextResponse.json(
        {
          error:
            "You are not authorized to register a content integrity witness for this record.",
        },
        { status: 403 }
      );
    }

    if (record.asset_hash.toLowerCase() !== parsed.data.assetHash.toLowerCase()) {
      return NextResponse.json(
        {
          error:
            "The selected source file is not the exact registered HPS asset. Use the original file whose SHA-256 matches the record.",
        },
        { status: 409 }
      );
    }

    const publicKey = process.env.HPS_REGISTRY_PUBLIC_KEY;
    const secretKey = process.env.HPS_REGISTRY_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return NextResponse.json(
        { error: "Registry signing unavailable." },
        { status: 503 }
      );
    }

    const now = new Date().toISOString();
    const registryPayload = {
      hpsVersion: "1.4",
      type: "content_integrity_witness",
      recordId: id,
      assetHash: parsed.data.assetHash.toLowerCase(),
      witnessVersion: parsed.data.witness.version,
      witnessMode: parsed.data.witness.mode,
      sourceTextSha256: parsed.data.witness.sourceTextSha256,
      entryCount: parsed.data.witness.entries.length,
      registeredBy: user.id,
      registeredAt: now,
    };

    const registrySignature = signRegistryObject(
      registryPayload,
      secretKey
    );

    const { data, error } = await admin
      .from("hps_content_witnesses")
      .upsert(
        {
          record_id: id,
          asset_hash: parsed.data.assetHash.toLowerCase(),
          mode: parsed.data.witness.mode,
          witness: parsed.data.witness,
          registered_by: user.id,
          registry_payload: registryPayload,
          registry_signature: registrySignature,
          registry_public_key: publicKey,
          updated_at: now,
        },
        { onConflict: "record_id" }
      )
      .select("record_id,mode,witness,created_at,updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        enabled: true,
        recordId: data.record_id,
        mode: data.mode,
        entryCount: data.witness?.entries?.length || 0,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        registrySignature,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unable to register the content integrity witness." },
      { status: 500 }
    );
  }
}
