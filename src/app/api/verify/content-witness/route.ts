import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { ContentIntegrityWitnessSchema } from "@/lib/hps/content-witness-schema";
import { verifyDetachedCanonical } from "@/lib/hps/crypto";

const BodySchema = z.object({
  recordId: z.string().min(8).max(120),
  candidateWitness: ContentIntegrityWitnessSchema,
});

type WitnessEntry = {
  category: string;
  value: string;
  normalizedValue: string;
  anchorHash: string;
  label: string;
  occurrence: number;
};

function entryKey(entry: WitnessEntry) {
  return `${entry.category}|${entry.anchorHash}|${entry.occurrence}`;
}

function normalizeLabel(value?: string | null) {
  return (value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—−_]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findBestLabelFallback(
  originalEntry: WitnessEntry,
  originalIndex: number,
  candidateEntries: WitnessEntry[],
  usedCandidateIndexes: Set<number>
) {
  const label = normalizeLabel(originalEntry.label);
  if (!label) return -1;

  const choices: number[] = [];

  candidateEntries.forEach((entry, index) => {
    if (usedCandidateIndexes.has(index)) return;
    if (entry.category !== originalEntry.category) return;
    if (normalizeLabel(entry.label) !== label) return;
    choices.push(index);
  });

  if (!choices.length) return -1;

  // If a label appears more than once, prefer the candidate at the closest
  // document-order position. This is safer than silently ignoring the anchor.
  choices.sort(
    (a, b) =>
      Math.abs(a - originalIndex) - Math.abs(b - originalIndex)
  );

  return choices[0];
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

    const originalEntries = original.entries as WitnessEntry[];
    const candidateEntries = candidate.entries as WitnessEntry[];

    const candidateExactMap = new Map<string, number[]>();
    candidateEntries.forEach((entry, index) => {
      const key = entryKey(entry);
      const indexes = candidateExactMap.get(key) || [];
      indexes.push(index);
      candidateExactMap.set(key, indexes);
    });

    const usedCandidateIndexes = new Set<number>();

    let exactAnchorMatches = 0;
    let labelFallbackMatches = 0;

    const changes: Array<{
      category: string;
      label: string;
      originalValue: string;
      candidateValue: string;
      anchorHash: string;
      occurrence: number;
      matchBasis: "exact_anchor" | "label_fallback";
    }> = [];

    const missingRegisteredEntries: Array<{
      category: string;
      label: string;
      originalValue: string;
      anchorHash: string;
      occurrence: number;
    }> = [];

    originalEntries.forEach((originalEntry, originalIndex) => {
      let candidateIndex = -1;
      let matchBasis: "exact_anchor" | "label_fallback" = "exact_anchor";

      const exactIndexes = candidateExactMap.get(entryKey(originalEntry)) || [];
      candidateIndex =
        exactIndexes.find(index => !usedCandidateIndexes.has(index)) ?? -1;

      if (candidateIndex >= 0) {
        exactAnchorMatches++;
      } else {
        candidateIndex = findBestLabelFallback(
          originalEntry,
          originalIndex,
          candidateEntries,
          usedCandidateIndexes
        );

        if (candidateIndex >= 0) {
          matchBasis = "label_fallback";
          labelFallbackMatches++;
        }
      }

      if (candidateIndex < 0) {
        missingRegisteredEntries.push({
          category: originalEntry.category,
          label: originalEntry.label,
          originalValue: originalEntry.value,
          anchorHash: originalEntry.anchorHash,
          occurrence: originalEntry.occurrence,
        });
        return;
      }

      usedCandidateIndexes.add(candidateIndex);
      const candidateEntry = candidateEntries[candidateIndex];

      if (
        candidateEntry.normalizedValue !== originalEntry.normalizedValue
      ) {
        changes.push({
          category: originalEntry.category,
          label: originalEntry.label || candidateEntry.label,
          originalValue: originalEntry.value,
          candidateValue: candidateEntry.value,
          anchorHash: originalEntry.anchorHash,
          occurrence: originalEntry.occurrence,
          matchBasis,
        });
      }
    });

    const extraCandidateEntries = candidateEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ index }) => !usedCandidateIndexes.has(index))
      .map(({ entry }) => ({
        category: entry.category,
        label: entry.label,
        candidateValue: entry.value,
        anchorHash: entry.anchorHash,
        occurrence: entry.occurrence,
      }));

    const matchedEntries =
      exactAnchorMatches + labelFallbackMatches;
    const registeredEntries = originalEntries.length;
    const coverage = registeredEntries
      ? matchedEntries / registeredEntries
      : 0;

    // Conservative rule: HPS may say "consistent" only when every registered
    // critical-value entry was accounted for and no unexplained candidate
    // critical-value entry remains. A missing anchor is not evidence of
    // unchanged content.
    const status =
      changes.length > 0
        ? "material_change_detected"
        : missingRegisteredEntries.length === 0 &&
            extraCandidateEntries.length === 0 &&
            matchedEntries === registeredEntries
          ? "critical_values_consistent"
          : "inconclusive";

    return NextResponse.json({
      available: true,
      recordId: parsed.data.recordId,
      status,
      validRegistrySignature: true,
      matchedEntries,
      exactAnchorMatches,
      labelFallbackMatches,
      registeredEntries,
      coverage: Number(coverage.toFixed(3)),
      materialChangeCount: changes.length,
      changes,
      missingRegisteredCount: missingRegisteredEntries.length,
      missingRegisteredEntries: missingRegisteredEntries.slice(0, 20),
      extraCandidateCount: extraCandidateEntries.length,
      extraCandidateEntries: extraCandidateEntries.slice(0, 20),
      note:
        status === "material_change_detected"
          ? labelFallbackMatches > 0
            ? "One or more registered critical values differ from the candidate. HPS used an exact registered field label as a fallback where cross-format extraction changed the surrounding anchor."
            : "One or more registered critical values differ from the candidate."
          : status === "critical_values_consistent"
            ? "All registered critical-value entries were accounted for and no changed value was found."
            : "HPS could not account for every registered critical-value entry. It will not claim the values are unchanged when an expected anchor is missing or an unexplained candidate value appears.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unable to verify the content integrity witness." },
      { status: 500 }
    );
  }
}
