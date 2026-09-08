import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { ContentIntegrityWitnessSchema } from "@/lib/hps/content-witness-schema";
import { verifyDetachedCanonical } from "@/lib/hps/crypto";

const BodySchema = z.object({
  recordId: z.string().min(8).max(120),
  candidateWitness: ContentIntegrityWitnessSchema,
});

function entryKey(entry: any) {
  return `${entry.category}|${entry.anchorHash}|${entry.occurrence}`;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid content witness verification request.",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();

    const { data, error } = await admin
      .from("hps_content_witnesses")
      .select(
        "record_id,mode,witness,registry_payload,registry_signature,registry_public_key"
      )
      .eq("record_id", parsed.data.recordId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (!data) {
      return NextResponse.json({
        available: false,
        recordId: parsed.data.recordId,
        status: "not_registered",
        changes: [],
      });
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

    if (!validRegistrySignature) {
      return NextResponse.json({
        available: true,
        recordId: parsed.data.recordId,
        status: "invalid_witness_signature",
        validRegistrySignature: false,
        changes: [],
      });
    }

    const originalParsed = ContentIntegrityWitnessSchema.safeParse(data.witness);
    if (!originalParsed.success) {
      return NextResponse.json({
        available: true,
        recordId: parsed.data.recordId,
        status: "invalid_registered_witness",
        validRegistrySignature: true,
        changes: [],
      });
    }

    const original = originalParsed.data;
    const candidate = parsed.data.candidateWitness;

    const candidateMap = new Map(
      candidate.entries.map(entry => [entryKey(entry), entry])
    );

    let matchedEntries = 0;
    const changes: Array<{
      category: string;
      label: string;
      originalValue: string;
      candidateValue: string;
      anchorHash: string;
      occurrence: number;
    }> = [];

    for (const originalEntry of original.entries) {
      const candidateEntry = candidateMap.get(entryKey(originalEntry));
      if (!candidateEntry) continue;

      matchedEntries++;

      if (
        candidateEntry.normalizedValue !== originalEntry.normalizedValue
      ) {
        changes.push({
          category: originalEntry.category,
          label: originalEntry.label,
          originalValue: originalEntry.value,
          candidateValue: candidateEntry.value,
          anchorHash: originalEntry.anchorHash,
          occurrence: originalEntry.occurrence,
        });
      }
    }

    const registeredEntries = original.entries.length;
    const coverage = registeredEntries
      ? matchedEntries / registeredEntries
      : 0;

    const status =
      changes.length > 0
        ? "material_change_detected"
        : matchedEntries > 0 && coverage >= 0.5
          ? "critical_values_consistent"
          : "inconclusive";

    return NextResponse.json({
      available: true,
      recordId: parsed.data.recordId,
      status,
      validRegistrySignature: true,
      matchedEntries,
      registeredEntries,
      coverage: Number(coverage.toFixed(3)),
      materialChangeCount: changes.length,
      changes,
      note:
        status === "material_change_detected"
          ? "One or more registered critical values differ from the candidate."
          : status === "critical_values_consistent"
            ? "No changed registered critical values were found among the matched witness anchors."
            : "Too few registered witness anchors matched to make a reliable content-value comparison.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unable to verify the content integrity witness." },
      { status: 500 }
    );
  }
}
