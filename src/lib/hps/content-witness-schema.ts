import { z } from "zod";

export const ContentWitnessCategorySchema = z.enum([
  "currency",
  "percentage",
  "date",
  "number",
]);

export const ContentWitnessModeSchema = z.enum([
  "public_values",
  "public_text",
]);

export const ContentWitnessEntrySchema = z.object({
  category: ContentWitnessCategorySchema,
  value: z.string().min(1).max(160),
  normalizedValue: z.string().min(1).max(160),
  anchorHash: z.string().regex(/^[a-f0-9]{64}$/i),
  label: z.string().max(160),
  occurrence: z.number().int().nonnegative(),
});

export const ContentIntegrityWitnessSchema = z.object({
  version: z.literal("hps-content-witness-1"),
  mode: ContentWitnessModeSchema,
  sourceTextSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  textSource: z.enum(["embedded", "ocr", "mixed", "extracted", "plain", "none"]),
  entries: z.array(ContentWitnessEntrySchema).max(250),
  truncated: z.boolean(),

  // Present only when the owner/issuer explicitly enables public_text mode.
  // This is recovered normalized text, not the original file bytes.
  publicText: z.string().max(250_000).nullable().optional(),
  publicTextTokenCount: z.number().int().nonnegative().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.mode === "public_text" && !value.publicText?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publicText"],
      message: "publicText is required when mode is public_text.",
    });
  }

  if (value.mode === "public_values" && value.publicText) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publicText"],
      message: "publicText must not be included in public_values mode.",
    });
  }
});

export type ContentWitnessCategory = z.infer<typeof ContentWitnessCategorySchema>;
export type ContentWitnessMode = z.infer<typeof ContentWitnessModeSchema>;
export type ContentWitnessEntry = z.infer<typeof ContentWitnessEntrySchema>;
export type ContentIntegrityWitness = z.infer<typeof ContentIntegrityWitnessSchema>;
