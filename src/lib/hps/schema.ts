import { z } from "zod";

export const contributionTypes = [
  "concept","research","reasoning","writing","composition","algorithm_design",
  "coding","drawing","photography","editing","selection","curation",
  "parameter_design","data_collection","analysis","fact_checking","testing",
  "final_approval","other"
] as const;

export const HPSManifestSchema = z.object({
  hpsVersion: z.literal("0.4"),
  id: z.string().min(8),
  work: z.object({
    title: z.string().min(1),
    type: z.string().min(1),
    createdAt: z.string().datetime(),
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    fileName: z.string().optional()
  }),
  actors: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    publicKey: z.string().optional(),
    identityAssurance: z.enum([
      "self_declared","account_verified","identity_verified","institutionally_attested"
    ])
  })).min(1),
  contributions: z.array(z.object({
    actorId: z.string(),
    type: z.enum(contributionTypes),
    origin: z.enum(["human","ai_assisted","automated"]),
    description: z.string().min(3),
    evidenceIds: z.array(z.string()).default([]),
    confidence: z.enum([
      "self_declared","evidence_backed","third_party_attested"
    ]).default("self_declared")
  })).min(1),
  tools: z.array(z.object({
    name: z.string(),
    role: z.string(),
    generativeAI: z.boolean(),
    scope: z.string().optional(),
    humanOversight: z.enum(["none","low","medium","high"]).optional()
  })).default([]),
  evidence: z.array(z.object({
    id: z.string(),
    type: z.string(),
    visibility: z.enum(["public","hashed","sealed"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    note: z.string().optional()
  })).default([]),
  responsibility: z.object({
    finalApprovalActorId: z.string(),
    statement: z.string().min(10)
  }),
  issuedAt: z.string().datetime(),
  creatorSignature: z.object({
    algorithm: z.literal("Ed25519"),
    publicKey: z.string(),
    value: z.string()
  }).optional(),
  registry: z.object({
    name: z.string(),
    publicKey: z.string(),
    signedAt: z.string().datetime()
  }).optional(),
  registrySignature: z.object({
    algorithm: z.literal("Ed25519"),
    value: z.string()
  }).optional()
});

export type HPSManifest = z.infer<typeof HPSManifestSchema>;

export const CreateRecordSchema = z.object({
  title: z.string().min(1).max(240),
  creatorName: z.string().min(1).max(240),
  workType: z.string().min(1).max(100),
  fileName: z.string().max(500).optional(),
  assetHash: z.string().regex(/^[a-f0-9]{64}$/i),
  contributionTypes: z.array(z.enum(contributionTypes)).min(1),
  aiUsed: z.boolean(),
  primaryTool: z.string().max(200).optional(),
  processNote: z.string().max(4000).optional(),
  creatorPublicKey: z.string().min(20),
  creatorSignature: z.string().min(20),
  unsignedPayload: z.string().min(20),
  parentRecordId: z.string().optional()
});

export const AttestationSchema = z.object({
  claimType: z.enum([
    "authorship","process_observed","employment_role","institutional_affiliation",
    "research_supervision","editorial_review","other"
  ]),
  statement: z.string().min(10).max(3000),
  institution: z.string().max(300).optional()
});
