import {z} from "zod";
export const HPSManifestSchema=z.object({
  hpsVersion:z.literal("0.1"),
  id:z.string().min(8),
  work:z.object({
    title:z.string().min(1),type:z.string().min(1),createdAt:z.string().datetime(),
    version:z.string().default("1.0"),sha256:z.string().regex(/^[a-f0-9]{64}$/i),
    fileName:z.string().optional()
  }),
  actors:z.array(z.object({
    id:z.string(),name:z.string(),role:z.string(),
    identityAssurance:z.enum(["self_declared","account_verified","identity_verified","institutionally_attested"])
  })).min(1),
  contributions:z.array(z.object({
    actorId:z.string(),
    type:z.enum(["concept","research","reasoning","writing","composition","algorithm_design","coding","drawing","photography","editing","selection","curation","parameter_design","data_collection","analysis","fact_checking","testing","final_approval","other"]),
    origin:z.enum(["human","ai_assisted","automated"]),
    description:z.string().min(3),evidenceIds:z.array(z.string()).default([]),
    confidence:z.enum(["self_declared","evidence_backed","third_party_attested"]).default("self_declared")
  })).min(1),
  tools:z.array(z.object({
    name:z.string(),role:z.string(),generativeAI:z.boolean(),
    scope:z.string().optional(),humanOversight:z.enum(["none","low","medium","high"]).optional()
  })).default([]),
  evidence:z.array(z.object({
    id:z.string(),type:z.string(),visibility:z.enum(["public","hashed","sealed"]),
    sha256:z.string().regex(/^[a-f0-9]{64}$/i),uri:z.string().url().optional(),note:z.string().optional()
  })).default([]),
  responsibility:z.object({finalApprovalActorId:z.string(),statement:z.string().min(10)}),
  issuedAt:z.string().datetime(),
  issuer:z.object({actorId:z.string(),publicKey:z.string()}).optional(),
  signature:z.object({algorithm:z.literal("Ed25519"),value:z.string()}).optional()
});
export type HPSManifest=z.infer<typeof HPSManifestSchema>;