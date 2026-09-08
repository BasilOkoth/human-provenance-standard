import { z } from "zod";

export const ContentWitnessCategorySchema = z.enum([
  "currency",
  "percentage",
  "date",
  "number",
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
  mode: z.literal("public_values"),
  sourceTextSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  textSource: z.enum(["embedded", "ocr", "mixed", "extracted", "plain", "none"]),
  entries: z.array(ContentWitnessEntrySchema).max(250),
  truncated: z.boolean(),
});

export type ContentWitnessCategory = z.infer<typeof ContentWitnessCategorySchema>;
export type ContentWitnessEntry = z.infer<typeof ContentWitnessEntrySchema>;
export type ContentIntegrityWitness = z.infer<typeof ContentIntegrityWitnessSchema>;
