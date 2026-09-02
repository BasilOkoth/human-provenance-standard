import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

import {
  CreateRecordSchema,
  AssetFingerprintSchema,
  type HPSManifest
} from "@/lib/hps/schema";

import { createHpsId } from "@/lib/hps/ids";

import {
  verifyDetachedCanonical,
  signRegistryManifest
} from "@/lib/hps/crypto";

import {
  compareAssetFingerprints
} from "@/lib/hps/fingerprint-compare";

export const runtime = "nodejs";

const hashText = (text: string) =>
  crypto
    .createHash("sha256")
    .update(text, "utf8")
    .digest("hex");

/*
 * These relationship classes must NOT silently become
 * another independent "original" HPS record.
 */
const BLOCKING_RELATIONSHIPS = new Set([
  "exact_original",
  "registered_derivative",
  "verified_derivative",
  "derivative_candidate",
  "modified_derivative"
]);

function conflictResponse(
  message: string,
  conflict: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: message,
      code: "HPS_PROVENANCE_CONFLICT",
      conflict
    },
    {
      status: 409
    }
  );
}

/*
 * Determine whether a detected relationship is actually
 * the explicitly declared parent for a legitimate new version.
 *
 * A modified version may be allowed when the creator explicitly
 * supplies parentRecordId.
 *
 * Exact duplicate bytes are NEVER considered a meaningful
 * new version.
 */
function relationshipCanBeVersioned(
  relationship: string,
  matchedRecordId: string,
  parentRecordId?: string | null
) {
  if (!parentRecordId) return false;

  if (matchedRecordId !== parentRecordId) {
    return false;
  }

  return (
    relationship === "modified_derivative" ||
    relationship === "derivative_candidate"
  );
}

export async function POST(request: NextRequest) {
  try {
    /*
     * ------------------------------------------------------
     * 01. AUTHENTICATE USER
     * ------------------------------------------------------
     */

    const auth = await createServerSupabase();

    const {
      data: { user }
    } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Authentication required."
        },
        {
          status: 401
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 02. VALIDATE REQUEST
     * ------------------------------------------------------
     */

    const body = await request.json();

    const parsed =
      CreateRecordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid provenance input.",
          details: parsed.error.issues
        },
        {
          status: 400
        }
      );
    }

    const {
      creatorClaim,
      creatorSignature,
      processNote
    } = parsed.data;

    /*
     * HPS v1.1 requires a complete fingerprint for every
     * newly created creator-provenance record.
     *
     * This prevents callers from bypassing derivative checks
     * by POSTing only a SHA-256 through the API.
     */
    if (!creatorClaim.assetFingerprint) {
      return NextResponse.json(
        {
          error:
            "HPS v1.1 asset fingerprint required. Re-select the original file and allow HPS to complete its provenance check."
        },
        {
          status: 400
        }
      );
    }

    const fingerprintResult =
      AssetFingerprintSchema.safeParse(
        creatorClaim.assetFingerprint
      );

    if (!fingerprintResult.success) {
      return NextResponse.json(
        {
          error: "Invalid HPS asset fingerprint.",
          details:
            fingerprintResult.error.issues
        },
        {
          status: 400
        }
      );
    }

    const candidateFingerprint =
      fingerprintResult.data;

    /*
     * The signed claim must not contain one SHA-256 while
     * its fingerprint contains another.
     */
    if (
      candidateFingerprint.exactSha256.toLowerCase() !==
      creatorClaim.assetHash.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "Asset fingerprint SHA-256 does not match creator claim."
        },
        {
          status: 400
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 03. VERIFY CREATOR SIGNATURE
     * ------------------------------------------------------
     */

    if (
      !verifyDetachedCanonical(
        creatorClaim,
        creatorSignature,
        creatorClaim.creatorPublicKey
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Creator canonical signature verification failed."
        },
        {
          status: 400
        }
      );
    }

    const admin =
      createAdminSupabase();

    /*
     * ------------------------------------------------------
     * 04. VERIFY CREATOR IDENTITY KEY
     * ------------------------------------------------------
     */

    const {
      data: profile,
      error: profileError
    } = await admin
      .from("hps_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      throw profileError;
    }

    if (
      profile?.public_key &&
      profile.public_key !==
        creatorClaim.creatorPublicKey
    ) {
      return NextResponse.json(
        {
          error:
            "Creator key does not match account key."
        },
        {
          status: 400
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 05. EXACT SHA-256 DUPLICATE CHECK
     * ------------------------------------------------------
     *
     * This is the strongest comparison.
     *
     * Same bytes = same digital asset.
     */

    const {
      data: exactMatches,
      error: exactError
    } = await admin
      .from("hps_records")
      .select(
        `
        id,
        owner_user_id,
        title,
        creator_name,
        record_kind,
        asset_hash,
        status,
        version,
        parent_record_id
        `
      )
      .eq(
        "asset_hash",
        creatorClaim.assetHash.toLowerCase()
      )
      .in(
        "status",
        ["active", "superseded"]
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(20);

    if (exactError) {
      throw exactError;
    }

    if (
      exactMatches &&
      exactMatches.length > 0
    ) {
      const existing =
        exactMatches[0];

      const sameOwner =
        existing.owner_user_id === user.id;

      /*
       * Even parent/version creation cannot use
       * byte-for-byte identical content.
       */
      return conflictResponse(
        sameOwner
          ? "Registration blocked. This exact file is already registered in HPS."
          : "Registration blocked. The exact same digital asset is already associated with another HPS provenance record.",
        {
          verificationClass:
            "exact_original",

          existingRecordId:
            existing.id,

          existingTitle:
            existing.title,

          existingCreator:
            existing.creator_name,

          sameOwner,

          assetHash:
            creatorClaim.assetHash
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 06. REGISTERED DERIVATIVE CHECK
     * ------------------------------------------------------
     *
     * If this exact hash was previously registered as a
     * derivative, it cannot later be claimed as a fresh
     * independent original.
     */

    const {
      data: registeredDerivatives,
      error: derivativeError
    } = await admin
      .from(
        "hps_registered_derivatives"
      )
      .select(
        `
        parent_record_id,
        derivative_sha256,
        transformation_type,
        assurance,
        comparison,
        created_at
        `
      )
      .eq(
        "derivative_sha256",
        creatorClaim.assetHash.toLowerCase()
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(20);

    if (derivativeError) {
      throw derivativeError;
    }

    if (
      registeredDerivatives &&
      registeredDerivatives.length > 0
    ) {
      const derivative =
        registeredDerivatives[0];

      return conflictResponse(
        "Registration blocked. This file is already registered as a derivative of an existing HPS asset.",
        {
          verificationClass:
            "registered_derivative",

          parentRecordId:
            derivative.parent_record_id,

          transformationType:
            derivative.transformation_type,

          assurance:
            derivative.assurance,

          comparison:
            derivative.comparison
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 07. COMPRESSION-RESILIENT / SIMILARITY CHECK
     * ------------------------------------------------------
     *
     * Search records that have HPS v1.1 fingerprints.
     */

    const candidateRows =
      new Map<string, any>();

    /*
     * First search by canonical text SHA-256.
     *
     * This catches many PDFs whose bytes changed because
     * of compression, optimization, metadata stripping,
     * object reordering, etc.
     */
    if (
      candidateFingerprint.canonicalTextSha256
    ) {
      const {
        data: canonicalMatches,
        error: canonicalError
      } = await admin
        .from("hps_records")
        .select(
          `
          id,
          owner_user_id,
          title,
          creator_name,
          record_kind,
          status,
          version,
          asset_hash,
          asset_fingerprint,
          canonical_text_sha256
          `
        )
        .eq(
          "canonical_text_sha256",
          candidateFingerprint
            .canonicalTextSha256
        )
        .not(
          "asset_fingerprint",
          "is",
          null
        )
        .in(
          "status",
          ["active", "superseded"]
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(100);

      if (canonicalError) {
        throw canonicalError;
      }

      (
        canonicalMatches || []
      ).forEach(
        row =>
          candidateRows.set(
            row.id,
            row
          )
      );
    }

    /*
     * Fallback pool.
     *
     * This catches:
     * - visually similar images
     * - scanned documents
     * - slightly changed text
     * - modified derivatives
     *
     * 250 is deliberately bounded so creation cannot
     * turn into an unlimited full-table comparison.
     */
    const {
      data: recentFingerprintRows,
      error: fingerprintRowsError
    } = await admin
      .from("hps_records")
      .select(
        `
        id,
        owner_user_id,
        title,
        creator_name,
        record_kind,
        status,
        version,
        asset_hash,
        asset_fingerprint,
        canonical_text_sha256
        `
      )
      .not(
        "asset_fingerprint",
        "is",
        null
      )
      .in(
        "status",
        ["active", "superseded"]
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(250);

    if (fingerprintRowsError) {
      throw fingerprintRowsError;
    }

    (
      recentFingerprintRows || []
    ).forEach(
      row =>
        candidateRows.set(
          row.id,
          row
        )
    );

    /*
     * Compare candidate against every potential related
     * record using HPS fingerprint comparison rules.
     */
    const relationships: {
      record: any;
      comparison: ReturnType<
        typeof compareAssetFingerprints
      >;
    }[] = [];

    for (
      const row of
      candidateRows.values()
    ) {
      const originalParsed =
        AssetFingerprintSchema.safeParse(
          row.asset_fingerprint
        );

      if (!originalParsed.success) {
        continue;
      }

      const comparison =
        compareAssetFingerprints(
          originalParsed.data,
          candidateFingerprint
        );

      if (
        comparison.status ===
        "unverified"
      ) {
        continue;
      }

      relationships.push({
        record: row,
        comparison
      });
    }

    /*
     * Strongest relationships first.
     */
    const priority:
      Record<string, number> = {
        exact_original: 0,
        verified_derivative: 1,
        derivative_candidate: 2,
        modified_derivative: 3,
        unverified: 99
      };

    relationships.sort(
      (a, b) => {
        const left =
          priority[
            a.comparison.status
          ] ?? 99;

        const right =
          priority[
            b.comparison.status
          ] ?? 99;

        if (left !== right) {
          return left - right;
        }

        return (
          (b.comparison
            .visualSimilarity || 0) -
          (a.comparison
            .visualSimilarity || 0)
        );
      }
    );

    const strongestRelationship =
      relationships[0];

    /*
     * ------------------------------------------------------
     * 08. BLOCK FALSE "NEW ORIGINALS"
     * ------------------------------------------------------
     */

    if (strongestRelationship) {
      const {
        record: existing,
        comparison
      } = strongestRelationship;

      if (
        BLOCKING_RELATIONSHIPS.has(
          comparison.status
        )
      ) {
        /*
         * Exception:
         *
         * A deliberately created new version may reference
         * its known parent.
         *
         * We allow modified/candidate relationships only
         * when that exact existing record is explicitly
         * supplied as parentRecordId.
         */
        const allowedAsVersion =
          relationshipCanBeVersioned(
            comparison.status,
            existing.id,
            creatorClaim.parentRecordId
          );

        if (!allowedAsVersion) {
          return conflictResponse(
            comparison.status ===
              "verified_derivative"
              ? "Registration blocked. HPS detected a provenance-preserving derivative of an existing asset. Register it as a derivative instead of a new original."
              : comparison.status ===
                  "derivative_candidate"
                ? "Registration blocked pending provenance review. HPS detected a strong relationship with an existing asset."
                : comparison.status ===
                    "modified_derivative"
                  ? "Registration blocked. HPS detected a modified derivative of an existing asset. Create an explicit new version or derivative relationship instead."
                  : "Registration blocked. Existing provenance was detected.",
            {
              verificationClass:
                comparison.status,

              assurance:
                comparison.assurance,

              existingRecordId:
                existing.id,

              existingTitle:
                existing.title,

              existingCreator:
                existing.creator_name,

              existingOwner:
                existing.owner_user_id,

              sameOwner:
                existing.owner_user_id ===
                user.id,

              comparison
            }
          );
        }
      }
    }

    /*
     * ------------------------------------------------------
     * 09. VALIDATE EXPLICIT PARENT VERSION
     * ------------------------------------------------------
     */

    let version = 1;

    if (
      creatorClaim.parentRecordId
    ) {
      const {
        data: parent,
        error: parentError
      } = await admin
        .from("hps_records")
        .select(
          `
          id,
          version,
          owner_user_id,
          status
          `
        )
        .eq(
          "id",
          creatorClaim.parentRecordId
        )
        .single();

      if (
        parentError ||
        !parent ||
        parent.owner_user_id !==
          user.id
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid parent record."
          },
          {
            status: 400
          }
        );
      }

      if (
        parent.status === "revoked"
      ) {
        return NextResponse.json(
          {
            error:
              "A revoked provenance record cannot be used as the parent of a new version."
          },
          {
            status: 400
          }
        );
      }

      version =
        (parent.version || 1) + 1;
    }

    /*
     * ------------------------------------------------------
     * 10. CHECK REGISTRY SIGNING SERVICE
     * ------------------------------------------------------
     */

    const publicKey =
      process.env
        .HPS_REGISTRY_PUBLIC_KEY;

    const secretKey =
      process.env
        .HPS_REGISTRY_SECRET_KEY;

    if (
      !publicKey ||
      !secretKey
    ) {
      return NextResponse.json(
        {
          error:
            "Registry signing service is not configured."
        },
        {
          status: 503
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 11. BUILD HPS MANIFEST
     * ------------------------------------------------------
     */

    const id =
      createHpsId();

    const now =
      new Date().toISOString();

    const assurance =
      profile?.institution_verified
        ? "institutionally_attested"
        : "account_verified";

    const evidence =
      processNote
        ? [
            {
              id: "process-note-1",
              type: "process_note",
              visibility:
                "hashed" as const,

              sha256:
                hashText(
                  processNote
                ),

              note:
                "Hash of creator-supplied process note."
            }
          ]
        : [];

    const manifest:
      HPSManifest = {
      hpsVersion: "1.0",

      id,

      work: {
        title:
          creatorClaim.title,

        type:
          creatorClaim.workType,

        createdAt:
          creatorClaim.issuedAt,

        version,

        sha256:
          creatorClaim.assetHash,

        fileName:
          creatorClaim.fileName,

        /*
         * CRITICAL v1.1 addition.
         *
         * The fingerprint is now inside
         * the countersigned manifest.
         */
        fingerprint:
          candidateFingerprint
      },

      actors: [
        {
          id: "creator",

          name:
            creatorClaim.creatorName,

          role: "creator",

          publicKey:
            creatorClaim.creatorPublicKey,

          identityAssurance:
            assurance
        }
      ],

      contributions:
        creatorClaim
          .contributionTypes
          .map(type => ({
            actorId: "creator",

            type,

            origin:
              type ===
              "final_approval"
                ? "human"
                : creatorClaim.aiUsed
                  ? "ai_assisted"
                  : "human",

            description:
              `${creatorClaim.creatorName} declares responsibility for ${type.replaceAll(
                "_",
                " "
              )} in this work.`,

            evidenceIds:
              evidence.length
                ? [
                    "process-note-1"
                  ]
                : [],

            confidence:
              evidence.length
                ? "evidence_backed"
                : "self_declared"
          })),

      tools:
        creatorClaim.primaryTool
          ? [
              {
                name:
                  creatorClaim.primaryTool,

                role:
                  "creation assistance",

                generativeAI:
                  creatorClaim.aiUsed,

                scope:
                  creatorClaim.aiUsed
                    ? "Creator disclosed generative AI assistance."
                    : "Creator disclosed tool use.",

                humanOversight:
                  "high"
              }
            ]
          : [],

      evidence,

      responsibility: {
        finalApprovalActorId:
          "creator",

        statement:
          "The authenticated creator signed the canonical HPS contribution claim and accepts responsibility for the final work."
      },

      issuedAt: now,

      /*
       * creatorClaim includes assetFingerprint,
       * so the creator signature also covers it.
       */
      creatorClaim,

      creatorSignature: {
        algorithm:
          "Ed25519",

        publicKey:
          creatorClaim.creatorPublicKey,

        keyId:
          "creator-primary",

        value:
          creatorSignature
      },

      interoperability: {
        c2pa: {
          mappingVersion:
            "1.0",

          status:
            "exportable"
        },

        verifiableCredential: {
          contextVersion:
            "2.0",

          status:
            "exportable"
        }
      }
    };

    /*
     * ------------------------------------------------------
     * 12. REGISTRY COUNTERSIGNATURE
     * ------------------------------------------------------
     */

    const countersigned =
      signRegistryManifest(
        manifest,
        publicKey,
        secretKey
      );

    /*
     * ------------------------------------------------------
     * 13. FINAL EXACT-HASH CHECK
     * ------------------------------------------------------
     *
     * Repeat immediately before insert.
     *
     * This reduces the window in which two requests could
     * both pass the first preflight check.
     */

    const {
      data: lastSecondMatch,
      error:
        lastSecondMatchError
    } = await admin
      .from("hps_records")
      .select(
        "id,title,creator_name,owner_user_id"
      )
      .eq(
        "asset_hash",
        creatorClaim.assetHash
      )
      .in(
        "status",
        ["active", "superseded"]
      )
      .limit(1);

    if (
      lastSecondMatchError
    ) {
      throw lastSecondMatchError;
    }

    if (
      lastSecondMatch &&
      lastSecondMatch.length
    ) {
      return conflictResponse(
        "Registration blocked. Another HPS record registered this exact asset before this request completed.",
        {
          verificationClass:
            "exact_original",

          existingRecordId:
            lastSecondMatch[0].id,

          existingTitle:
            lastSecondMatch[0].title,

          existingCreator:
            lastSecondMatch[0]
              .creator_name
        }
      );
    }

    /*
     * ------------------------------------------------------
     * 14. INSERT RECORD
     * ------------------------------------------------------
     *
     * v1.1 fingerprint fields are stored separately too,
     * making indexed derivative searches possible.
     */

    const {
      error: insertError
    } = await admin
      .from("hps_records")
      .insert({
        id,

        owner_user_id:
          user.id,

        title:
          creatorClaim.title,

        creator_name:
          creatorClaim.creatorName,

        work_type:
          creatorClaim.workType,

        record_kind:
          "creator_provenance",

        asset_hash:
          creatorClaim.assetHash,

        /*
         * HPS v1.1 fields
         */
        asset_fingerprint:
          candidateFingerprint,

        canonical_text_sha256:
          candidateFingerprint
            .canonicalTextSha256 ||
          null,

        fingerprint_version:
          candidateFingerprint
            .version,

        manifest:
          countersigned,

        creator_signature:
          creatorSignature,

        creator_public_key:
          creatorClaim
            .creatorPublicKey,

        registry_signature:
          countersigned
            .registrySignature!
            .value,

        registry_public_key:
          publicKey,

        version,

        parent_record_id:
          creatorClaim.parentRecordId ||
          null,

        status:
          "active"
      });

    if (insertError) {
      throw insertError;
    }

    /*
     * ------------------------------------------------------
     * 15. SUPERSEDE PARENT IF THIS IS A VERSION
     * ------------------------------------------------------
     */

    if (
      creatorClaim.parentRecordId
    ) {
      const {
        error: supersedeError
      } = await admin
        .from("hps_records")
        .update({
          status:
            "superseded",

          superseded_by_id:
            id
        })
        .eq(
          "id",
          creatorClaim.parentRecordId
        )
        .eq(
          "owner_user_id",
          user.id
        );

      if (
        supersedeError
      ) {
        throw supersedeError;
      }
    }

    /*
     * ------------------------------------------------------
     * 16. SUCCESS
     * ------------------------------------------------------
     */

    return NextResponse.json(
      {
        id,

        manifest:
          countersigned,

        identityAssurance:
          assurance,

        duplicateCheck:
          "passed",

        fingerprintVersion:
          candidateFingerprint.version
      },
      {
        status: 201
      }
    );

  } catch (e) {
    console.error(
      "HPS record creation error:",
      e
    );

    return NextResponse.json(
      {
        error:
          "Unable to create HPS record."
      },
      {
        status: 500
      }
    );
  }
}

export async function GET() {
  try {
    const admin =
      createAdminSupabase();

    const {
      data,
      error
    } = await admin
      .from("hps_records")
      .select(
        `
        id,
        title,
        creator_name,
        work_type,
        record_kind,
        version,
        status,
        issuer_org_id,
        fingerprint_version,
        created_at
        `
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(100);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      records:
        data || []
    });

  } catch (e) {
    console.error(
      "Unable to list HPS records:",
      e
    );

    return NextResponse.json({
      records: []
    });
  }
}
