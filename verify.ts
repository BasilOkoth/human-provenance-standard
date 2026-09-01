import { HPSManifestSchema } from "./schema";
import { verifyManifestSignature } from "./crypto";

export function verifyHPSManifest(input:unknown) {
  const parsed = HPSManifestSchema.safeParse(input);
  if (!parsed.success) {
    return { validSchema:false, validSignature:false, errors:parsed.error.issues };
  }
  const m = parsed.data;
  return {
    validSchema:true,
    validSignature:verifyManifestSignature(m),
    identityStatus:m.actors.find(a=>a.id===m.responsibility.finalApprovalActorId)?.identityAssurance ?? "unknown",
    evidence:{
      public:m.evidence.filter(e=>e.visibility==="public").length,
      hashed:m.evidence.filter(e=>e.visibility==="hashed").length,
      sealed:m.evidence.filter(e=>e.visibility==="sealed").length
    },
    contributions:{
      human:m.contributions.filter(c=>c.origin==="human").length,
      aiAssisted:m.contributions.filter(c=>c.origin==="ai_assisted").length,
      automated:m.contributions.filter(c=>c.origin==="automated").length
    },
    errors:[]
  };
}
