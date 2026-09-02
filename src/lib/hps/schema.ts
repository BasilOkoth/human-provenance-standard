import { z } from "zod";

export const contributionTypes = [
  "concept","research","reasoning","writing","composition","algorithm_design",
  "coding","drawing","photography","editing","selection","curation",
  "parameter_design","data_collection","analysis","fact_checking","testing",
  "final_approval","other"
] as const;


export const AssetFingerprintSchema = z.object({
  version: z.literal("hps-fingerprint-1"),
  exactSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  mimeType: z.string().max(200),
  fileName: z.string().max(500).optional(),
  byteLength: z.number().int().nonnegative(),
  modality: z.enum(["text","visual","text_visual","binary"]),
  canonicalTextSha256: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  canonicalTextLength: z.number().int().nonnegative().nullable().optional(),
  textSimHash64: z.string().regex(/^[a-f0-9]{16}$/i).nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  visualPHashes: z.array(z.string().regex(/^[a-f0-9]{16}$/i)).optional(),
  visualDHashes: z.array(z.string().regex(/^[a-f0-9]{16}$/i)).optional(),
  visualPageIndexes: z.array(z.number().int().positive()).optional(),
  visualCoverage: z.number().min(0).max(1).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  warnings: z.array(z.string().max(500)).optional()
});

export type AssetFingerprint = z.infer<typeof AssetFingerprintSchema>;

export const IdentityAssuranceSchema = z.enum([
  "self_declared","account_verified","identity_verified","institutionally_attested",
  "organization_account_verified","institution_verified","authorized_issuer_verified"
]);

const SignatureSchema = z.object({
  algorithm: z.literal("Ed25519"),
  publicKey: z.string().optional(),
  keyId: z.string().optional(),
  value: z.string()
});

export const CreatorClaimSchema = z.object({
  title: z.string().min(1).max(240),
  creatorName: z.string().min(1).max(240),
  workType: z.string().min(1).max(100),
  fileName: z.string().max(500).optional(),
  assetHash: z.string().regex(/^[a-f0-9]{64}$/i),
  assetFingerprint: AssetFingerprintSchema.optional(),
  contributionTypes: z.array(z.enum(contributionTypes)).min(1),
  aiUsed: z.boolean(),
  primaryTool: z.string().max(200).nullable().optional(),
  processNoteHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  creatorPublicKey: z.string().min(20),
  parentRecordId: z.string().nullable().optional(),
  issuedAt: z.string().datetime()
});

export const InstitutionClaimSchema = z.object({
  organizationId: z.string().uuid(),
  organizationName: z.string().min(2).max(300),
  documentType: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  subjectName: z.string().max(240).optional(),
  fileName: z.string().max(500).optional(),
  assetHash: z.string().regex(/^[a-f0-9]{64}$/i),
  assetFingerprint: AssetFingerprintSchema.optional(),
  issuerPublicKey: z.string().min(20),
  issuerKeyId: z.string().uuid(),
  parentRecordId: z.string().nullable().optional(),
  issuedAt: z.string().datetime()
});

export const HPSManifestSchema = z.object({
  hpsVersion: z.enum(["0.4","1.0"]),
  id: z.string().min(8),
  work: z.object({
    title: z.string().min(1),
    type: z.string().min(1),
    createdAt: z.string().datetime(),
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    fileName: z.string().optional(),
    fingerprint: AssetFingerprintSchema.optional()
  }),
  actors: z.array(z.object({
    id: z.string(), name: z.string(), role: z.string(), publicKey: z.string().optional(),
    identityAssurance: IdentityAssuranceSchema,
    organizationId: z.string().uuid().optional()
  })).min(1),
  contributions: z.array(z.object({
    actorId: z.string(), type: z.enum(contributionTypes),
    origin: z.enum(["human","ai_assisted","automated"]),
    description: z.string().min(3), evidenceIds: z.array(z.string()).default([]),
    confidence: z.enum(["self_declared","evidence_backed","third_party_attested"]).default("self_declared")
  })).default([]),
  tools: z.array(z.object({
    name: z.string(), role: z.string(), generativeAI: z.boolean(), scope: z.string().optional(),
    humanOversight: z.enum(["none","low","medium","high"]).optional()
  })).default([]),
  evidence: z.array(z.object({
    id: z.string(), type: z.string(), visibility: z.enum(["public","hashed","sealed"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i), note: z.string().optional()
  })).default([]),
  responsibility: z.object({ finalApprovalActorId: z.string(), statement: z.string().min(10) }),
  issuedAt: z.string().datetime(),
  creatorClaim: CreatorClaimSchema.optional(),
  creatorSignature: SignatureSchema.optional(),
  institutionalClaim: InstitutionClaimSchema.optional(),
  institutionSignature: SignatureSchema.optional(),
  registry: z.object({ name: z.string(), publicKey: z.string(), signedAt: z.string().datetime(), keyId: z.string().optional() }).optional(),
  registrySignature: SignatureSchema.omit({publicKey:true}).optional(),
  interoperability: z.object({
    c2pa: z.object({ mappingVersion: z.string(), status: z.enum(["mapped","exportable","native"]) }).optional(),
    verifiableCredential: z.object({ contextVersion: z.string(), status: z.enum(["exportable","issued"]) }).optional()
  }).optional()
});

export type HPSManifest = z.infer<typeof HPSManifestSchema>;

export const CreateRecordSchema = z.object({
  creatorClaim: CreatorClaimSchema,
  creatorSignature: z.string().min(20),
  processNote: z.string().max(4000).optional()
});

export const AttestationSchema = z.object({
  claimType: z.enum(["authorship","process_observed","employment_role","institutional_affiliation","research_supervision","editorial_review","document_validity","other"]),
  statement: z.string().min(10).max(3000),
  institution: z.string().max(300).optional(),
  attestorPublicKey: z.string().min(20),
  attestorSignature: z.string().min(20),
  signedPayload: z.string().min(20)
});

export const CreateOrganizationSchema = z.object({ name:z.string().min(2).max(300), slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/) });
export const RegisterIssuerKeySchema = z.object({ publicKey:z.string().min(20), label:z.string().min(2).max(120).default("Primary issuer key") });
export const IssueInstitutionalRecordSchema = z.object({ institutionalClaim:InstitutionClaimSchema, institutionSignature:z.string().min(20) });
