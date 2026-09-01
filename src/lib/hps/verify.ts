import { HPSManifestSchema } from "./schema";
import { verifyRegistrySignature } from "./crypto";

export function verifyHPSManifest(input: unknown) {
  const parsed = HPSManifestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      validSchema: false,
      validRegistrySignature: false,
      creatorSignaturePresent: false,
      identityStatus: "unknown",
      errors: parsed.error.issues
    };
  }

  const manifest = parsed.data;

  const finalActor = manifest.actors.find(
    actor =>
      actor.id ===
      manifest.responsibility.finalApprovalActorId
  );

  return {
    validSchema: true,

    creatorSignaturePresent:
      Boolean(manifest.creatorSignature),

    validRegistrySignature:
      verifyRegistrySignature(manifest),

    identityStatus:
      finalActor?.identityAssurance ?? "unknown",

    assetHash:
      manifest.work.sha256,

    evidence: {
      public:
        manifest.evidence.filter(
          evidence =>
            evidence.visibility === "public"
        ).length,

      hashed:
        manifest.evidence.filter(
          evidence =>
            evidence.visibility === "hashed"
        ).length,

      sealed:
        manifest.evidence.filter(
          evidence =>
            evidence.visibility === "sealed"
        ).length
    },

    contributions: {
      human:
        manifest.contributions.filter(
          contribution =>
            contribution.origin === "human"
        ).length,

      aiAssisted:
        manifest.contributions.filter(
          contribution =>
            contribution.origin === "ai_assisted"
        ).length,

      automated:
        manifest.contributions.filter(
          contribution =>
            contribution.origin === "automated"
        ).length
    },

    errors: []
  };
}
