import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  IssueInstitutionalRecordSchema,
  type HPSManifest
} from "@/lib/hps/schema";
import {
  verifyDetachedCanonical,
  signRegistryManifest
} from "@/lib/hps/crypto";
import { createHpsId } from "@/lib/hps/ids";

const RELS = new Set([
  "co_issuer",
  "co_signatory",
  "attestor",
  "endorser"
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const raw = await req.json();
    const relationship = raw?.assetRelationship;

    const parsed = IssueInstitutionalRecordSchema.safeParse({
      institutionalClaim: raw?.institutionalClaim,
      institutionSignature: raw?.institutionSignature
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid institutional record.",
          details: parsed.error.issues
        },
        { status: 400 }
      );
    }

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

    const claim = parsed.data.institutionalClaim;

    if (claim.organizationId !== id) {
      return NextResponse.json(
        { error: "Organization mismatch." },
        { status: 400 }
      );
    }

    const a = createAdminSupabase();

    const [
      { data: member },
      { data: org },
      { data: key }
    ] = await Promise.all([
      a
        .from("hps_org_members")
        .select("role,status")
        .eq("org_id", id)
        .eq("user_id", user.id)
        .single(),
      a
        .from("hps_organizations")
        .select("*")
        .eq("id", id)
        .single(),
      a
        .from("hps_issuer_keys")
        .select("*")
        .eq("id", claim.issuerKeyId)
        .eq("org_id", id)
        .eq("status", "active")
        .single()
    ]);

    if (
      !member ||
      member.status !== "active" ||
      !["admin", "issuer"].includes(member.role)
    ) {
      return NextResponse.json(
        { error: "Authorized issuer role required." },
        { status: 403 }
      );
    }

    if (!org || org.verification_status !== "verified") {
      return NextResponse.json(
        {
          error:
            "Institution must be verified before it can issue HPS institutional records."
        },
        { status: 403 }
      );
    }

    if (!key || key.public_key !== claim.issuerPublicKey) {
      return NextResponse.json(
        { error: "Issuer key is not registered to this institution." },
        { status: 400 }
      );
    }

    if (
      !verifyDetachedCanonical(
        claim,
        parsed.data.institutionSignature,
        claim.issuerPublicKey
      )
    ) {
      return NextResponse.json(
        { error: "Institution signature verification failed." },
        { status: 400 }
      );
    }

    /* Exact bytes are never a meaningful new version. */
    const { data: dups, error: dupErr } = await a
      .from("hps_records")
      .select("id,title,creator_name,issuer_org_id,status,version,asset_hash")
      .eq("record_kind", "institutional_document")
      .eq("asset_hash", claim.assetHash)
      .in("status", ["active", "superseded"]);

    if (dupErr) throw dupErr;

    const same = (dups ?? []).filter(r => r.issuer_org_id === id);
    const other = (dups ?? []).filter(r => r.issuer_org_id !== id);

    if (same.length) {
      return NextResponse.json(
        {
          error:
            "This exact asset is already registered by this institution. A new version must contain changed bytes.",
          existing: same
        },
        { status: 409 }
      );
    }

    let parent: null | {
      id: string;
      version: number;
      issuer_org_id: string;
      status: string;
      asset_hash: string;
      record_kind: string;
    } = null;

    let version = 1;

    if (claim.parentRecordId) {
      const { data: parentRow, error: parentError } = await a
        .from("hps_records")
        .select("id,version,issuer_org_id,status,asset_hash,record_kind")
        .eq("id", claim.parentRecordId)
        .single();

      if (parentError || !parentRow) {
        return NextResponse.json(
          { error: "Parent HPS record not found." },
          { status: 400 }
        );
      }

      if (
        parentRow.record_kind !== "institutional_document" ||
        parentRow.issuer_org_id !== id
      ) {
        return NextResponse.json(
          {
            error:
              "The parent record must be an institutional record issued by this same institution."
          },
          { status: 400 }
        );
      }

      if (parentRow.status !== "active") {
        return NextResponse.json(
          {
            error:
              "Only an active institutional record can be used as the parent of a new version."
          },
          { status: 409 }
        );
      }

      if (parentRow.asset_hash === claim.assetHash) {
        return NextResponse.json(
          {
            error:
              "A new version cannot contain the exact same bytes as its parent."
          },
          { status: 409 }
        );
      }

      parent = parentRow;
      version = (parentRow.version || 1) + 1;
    }

    let rel: null | {
      relatedRecordId: string;
      relationshipType: string;
    } = null;

    if (other.length) {
      if (
        !relationship ||
        typeof relationship.relatedRecordId !== "string" ||
        !RELS.has(relationship.relationshipType)
      ) {
        return NextResponse.json(
          {
            error:
              "This exact asset is already registered by another institution. Declare a relationship before issuing.",
            duplicateAsset: true,
            existing: other
          },
          { status: 409 }
        );
      }

      if (!other.some(r => r.id === relationship.relatedRecordId)) {
        return NextResponse.json(
          { error: "Related HPS record does not match this exact asset." },
          { status: 400 }
        );
      }

      rel = {
        relatedRecordId: relationship.relatedRecordId,
        relationshipType: relationship.relationshipType
      };
    }

    const publicKey = process.env.HPS_REGISTRY_PUBLIC_KEY;
    const secretKey = process.env.HPS_REGISTRY_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return NextResponse.json(
        { error: "Registry signing unavailable." },
        { status: 503 }
      );
    }

    /* Reduce the chance of two concurrent requests registering the same bytes. */
    const { data: lateSame, error: lateSameError } = await a
      .from("hps_records")
      .select("id,title,version,status")
      .eq("record_kind", "institutional_document")
      .eq("issuer_org_id", id)
      .eq("asset_hash", claim.assetHash)
      .in("status", ["active", "superseded"])
      .limit(1);

    if (lateSameError) throw lateSameError;

    if (lateSame?.length) {
      return NextResponse.json(
        {
          error:
            "This exact asset was registered by this institution before the request completed.",
          existing: lateSame
        },
        { status: 409 }
      );
    }

    const recordId = createHpsId();
    const now = new Date().toISOString();

    const lifecycleStatement = parent
      ? ` This is Version ${version}, replacing ${parent.id}.`
      : "";

    const relationshipStatement = rel
      ? ` Relationship to ${rel.relatedRecordId}: ${rel.relationshipType}.`
      : "";

    const manifest: HPSManifest = {
      hpsVersion: "1.0",
      id: recordId,
      work: {
        title: claim.title,
        type: claim.documentType,
        createdAt: claim.issuedAt,
        version,
        sha256: claim.assetHash,
        fileName: claim.fileName
      },
      actors: [
        {
          id: "issuer",
          name: org.name,
          role: "institutional_issuer",
          publicKey: claim.issuerPublicKey,
          identityAssurance: "authorized_issuer_verified",
          organizationId: id
        }
      ],
      contributions: [],
      tools: [],
      evidence: [],
      responsibility: {
        finalApprovalActorId: "issuer",
        statement:
          `${org.name} issued this digital record through an authorized HPS institutional signer.` +
          lifecycleStatement +
          relationshipStatement
      },
      issuedAt: now,
      institutionalClaim: claim,
      institutionSignature: {
        algorithm: "Ed25519",
        publicKey: claim.issuerPublicKey,
        keyId: claim.issuerKeyId,
        value: parsed.data.institutionSignature
      },
      interoperability: {
        c2pa: {
          mappingVersion: "1.0",
          status: "exportable"
        },
        verifiableCredential: {
          contextVersion: "2.0",
          status: "exportable"
        }
      }
    };

    const signed = signRegistryManifest(
      manifest,
      publicKey,
      secretKey
    );

    const { error: insertError } = await a
      .from("hps_records")
      .insert({
        id: recordId,
        owner_user_id: user.id,
        title: claim.title,
        creator_name: org.name,
        work_type: claim.documentType,
        record_kind: "institutional_document",
        asset_hash: claim.assetHash,
        manifest: signed,
        registry_signature: signed.registrySignature!.value,
        registry_public_key: publicKey,
        institution_signature: parsed.data.institutionSignature,
        issuer_org_id: id,
        issuer_key_id: claim.issuerKeyId,
        version,
        parent_record_id: parent?.id || null,
        status: "active"
      });

    if (insertError) throw insertError;

    if (rel) {
      const { error: relErr } = await a
        .from("hps_asset_relationships")
        .insert({
          asset_hash: claim.assetHash,
          record_id: recordId,
          related_record_id: rel.relatedRecordId,
          relationship_type: rel.relationshipType,
          declaring_org_id: id,
          created_by: user.id
        });

      if (relErr) {
        await a.from("hps_records").delete().eq("id", recordId);
        throw relErr;
      }
    }

    if (parent) {
      const { data: superseded, error: supersedeError } = await a
        .from("hps_records")
        .update({
          status: "superseded",
          superseded_by_id: recordId
        })
        .eq("id", parent.id)
        .eq("issuer_org_id", id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

      if (supersedeError || !superseded) {
        await a
          .from("hps_asset_relationships")
          .delete()
          .eq("record_id", recordId);
        await a.from("hps_records").delete().eq("id", recordId);

        return NextResponse.json(
          {
            error:
              "The previous version changed before this issuance completed. Refresh the record and try again."
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      {
        id: recordId,
        manifest: signed,
        version,
        parentRecordId: parent?.id || null
      },
      { status: 201 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Unable to issue institutional record." },
      { status: 500 }
    );
  }
}
