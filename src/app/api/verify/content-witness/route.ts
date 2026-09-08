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

type MissingRegisteredEntry = {
  entry: WitnessEntry;
  originalIndex: number;
};

type ExtraCandidateEntry = {
  entry: WitnessEntry;
  candidateIndex: number;
};

type MatchBasis =
  | "exact_anchor"
  | "label_fallback"
  | "inferred_substitution";

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

function labelTokens(value?: string | null) {
  return new Set(
    normalizeLabel(value)
      .split(" ")
      .filter(Boolean)
  );
}

function labelSimilarity(a?: string | null, b?: string | null) {
  const left = labelTokens(a);
  const right = labelTokens(b);

  if (!left.size || !right.size) return 0;

  let intersection = 0;
  left.forEach(token => {
    if (right.has(token)) intersection++;
  });

  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function relativePosition(index: number, total: number) {
  if (total <= 1) return 0;
  return index / (total - 1);
}

function positionDistance(
  originalIndex: number,
  originalTotal: number,
  candidateIndex: number,
  candidateTotal: number
) {
  return Math.abs(
    relativePosition(originalIndex, originalTotal) -
      relativePosition(candidateIndex, candidateTotal)
  );
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

  choices.sort(
    (a, b) =>
      Math.abs(a - originalIndex) - Math.abs(b - originalIndex)
  );

  return choices[0];
}

function inferredPairScore(
  missing: MissingRegisteredEntry,
  extra: ExtraCandidateEntry,
  originalTotal: number,
  candidateTotal: number,
  initialCoverage: number,
  sameCategoryMissingCount: number,
  sameCategoryExtraCount: number,
  onlyUnmatchedPair: boolean
) {
  if (missing.entry.category !== extra.entry.category) return 0;

  let score = 40;

  const leftLabel = normalizeLabel(missing.entry.label);
  const rightLabel = normalizeLabel(extra.entry.label);
  const similarity = labelSimilarity(leftLabel, rightLabel);

  if (leftLabel && rightLabel && leftLabel === rightLabel) {
    score += 35;
  } else if (similarity >= 0.67) {
    score += 26;
  } else if (similarity >= 0.34) {
    score += 15;
  }

  const distance = positionDistance(
    missing.originalIndex,
    originalTotal,
    extra.candidateIndex,
    candidateTotal
  );

  if (distance <= 0.03) score += 25;
  else if (distance <= 0.08) score += 18;
  else if (distance <= 0.15) score += 10;

  if (missing.entry.occurrence === extra.entry.occurrence) {
    score += 4;
  }

  // A single unexplained registered value and a single unexplained candidate
  // value of the same type is strong substitution evidence when nearly all
  // other registered critical values matched.
  if (onlyUnmatchedPair && initialCoverage >= 0.85) {
    score = Math.max(score, 90);
  } else if (
    sameCategoryMissingCount === 1 &&
    sameCategoryExtraCount === 1 &&
    initialCoverage >= 0.9
  ) {
    score = Math.max(score, 82);
  }

  return Math.min(100, score);
}

function pairUnmatchedEntries(
  missing: MissingRegisteredEntry[],
  extras: ExtraCandidateEntry[],
  originalTotal: number,
  candidateTotal: number,
  initialCoverage: number
) {
  const usedMissing = new Set<number>();
  const usedExtras = new Set<number>();

  const candidates: Array<{
    missingIndex: number;
    extraIndex: number;
    score: number;
  }> = [];

  const onlyUnmatchedPair = missing.length === 1 && extras.length === 1;

  missing.forEach((left, missingIndex) => {
    const sameCategoryMissingCount = missing.filter(
      item => item.entry.category === left.entry.category
    ).length;

    extras.forEach((right, extraIndex) => {
      const sameCategoryExtraCount = extras.filter(
        item => item.entry.category === right.entry.category
      ).length;

      const score = inferredPairScore(
        left,
        right,
        originalTotal,
        candidateTotal,
        initialCoverage,
        sameCategoryMissingCount,
        sameCategoryExtraCount,
        onlyUnmatchedPair
      );

      if (score >= 75) {
        candidates.push({
          missingIndex,
          extraIndex,
          score,
        });
      }
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  const pairs: Array<{
    original: MissingRegisteredEntry;
    candidate: ExtraCandidateEntry;
    score: number;
  }> = [];

  for (const candidate of candidates) {
    if (
      usedMissing.has(candidate.missingIndex) ||
      usedExtras.has(candidate.extraIndex)
    ) {
      continue;
    }

    usedMissing.add(candidate.missingIndex);
    usedExtras.add(candidate.extraIndex);

    pairs.push({
      original: missing[candidate.missingIndex],
      candidate: extras[candidate.extraIndex],
      score: candidate.score,
    });
  }

  return {
    pairs,
    remainingMissing: missing.filter((_, index) => !usedMissing.has(index)),
    remainingExtras: extras.filter((_, index) => !usedExtras.has(index)),
  };
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

    const originalEntries = originalParsed.data.entries as WitnessEntry[];
    const candidateEntries =
      parsed.data.candidateWitness.entries as WitnessEntry[];

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
      registeredLabel?: string;
      candidateLabel?: string;
      originalValue: string;
      candidateValue: string;
      anchorHash: string;
      occurrence: number;
      matchBasis: MatchBasis;
      pairConfidence?: number;
    }> = [];

    const missingRegisteredEntries: MissingRegisteredEntry[] = [];

    originalEntries.forEach((originalEntry, originalIndex) => {
      let candidateIndex = -1;
      let matchBasis: MatchBasis = "exact_anchor";

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
          entry: originalEntry,
          originalIndex,
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
          registeredLabel: originalEntry.label,
          candidateLabel: candidateEntry.label,
          originalValue: originalEntry.value,
          candidateValue: candidateEntry.value,
          anchorHash: originalEntry.anchorHash,
          occurrence: originalEntry.occurrence,
          matchBasis,
        });
      }
    });

    const extraCandidateEntries: ExtraCandidateEntry[] = candidateEntries
      .map((entry, candidateIndex) => ({ entry, candidateIndex }))
      .filter(({ candidateIndex }) => !usedCandidateIndexes.has(candidateIndex));

    const registeredEntries = originalEntries.length;
    const initiallyMatchedEntries =
      exactAnchorMatches + labelFallbackMatches;
    const initialCoverage = registeredEntries
      ? initiallyMatchedEntries / registeredEntries
      : 0;

    const inferred = pairUnmatchedEntries(
      missingRegisteredEntries,
      extraCandidateEntries,
      originalEntries.length,
      candidateEntries.length,
      initialCoverage
    );

    let inferredSubstitutionMatches = 0;

    for (const pair of inferred.pairs) {
      inferredSubstitutionMatches++;

      const originalEntry = pair.original.entry;
      const candidateEntry = pair.candidate.entry;

      if (
        originalEntry.normalizedValue !== candidateEntry.normalizedValue
      ) {
        changes.push({
          category: originalEntry.category,
          label:
            originalEntry.label ||
            candidateEntry.label ||
            `${originalEntry.category} value`,
          registeredLabel: originalEntry.label,
          candidateLabel: candidateEntry.label,
          originalValue: originalEntry.value,
          candidateValue: candidateEntry.value,
          anchorHash: originalEntry.anchorHash,
          occurrence: originalEntry.occurrence,
          matchBasis: "inferred_substitution",
          pairConfidence: pair.score,
        });
      }
    }

    const matchedEntries =
      initiallyMatchedEntries + inferredSubstitutionMatches;
    const coverage = registeredEntries
      ? matchedEntries / registeredEntries
      : 0;

    const remainingMissing = inferred.remainingMissing;
    const remainingExtras = inferred.remainingExtras;

    // Conservative status policy:
    // - a high-confidence inferred old/new pair may support a CHANGE finding;
    // - inferred pairing alone is not used to produce a green "consistent"
    //   result when no value changed;
    // - any unaccounted registered/candidate values keep the result inconclusive.
    const status =
      changes.length > 0 &&
      remainingMissing.length === 0 &&
      remainingExtras.length === 0
        ? "material_change_detected"
        : changes.length > 0
          ? "material_change_detected"
          : inferredSubstitutionMatches === 0 &&
              remainingMissing.length === 0 &&
              remainingExtras.length === 0 &&
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
      inferredSubstitutionMatches,

      registeredEntries,
      coverage: Number(coverage.toFixed(3)),

      materialChangeCount: changes.length,
      changes,

      missingRegisteredCount: remainingMissing.length,
      missingRegisteredEntries: remainingMissing.slice(0, 20).map(item => ({
        category: item.entry.category,
        label: item.entry.label,
        originalValue: item.entry.value,
        anchorHash: item.entry.anchorHash,
        occurrence: item.entry.occurrence,
      })),

      extraCandidateCount: remainingExtras.length,
      extraCandidateEntries: remainingExtras.slice(0, 20).map(item => ({
        category: item.entry.category,
        label: item.entry.label,
        candidateValue: item.entry.value,
        anchorHash: item.entry.anchorHash,
        occurrence: item.entry.occurrence,
      })),

      note:
        status === "material_change_detected"
          ? inferredSubstitutionMatches > 0
            ? "HPS identified one or more high-confidence value substitutions after nearly all other registered critical values matched. The inferred pair uses value type, document position, available field-label similarity and the one-to-one unmatched pattern."
            : labelFallbackMatches > 0
              ? "One or more registered critical values differ from the candidate. HPS used the same registered field label as a fallback where cross-format extraction changed the surrounding anchor."
              : "One or more registered critical values differ from the candidate."
          : status === "critical_values_consistent"
            ? "All registered critical-value entries were accounted for using exact or exact-label matches, and no changed value was found."
            : inferredSubstitutionMatches > 0
              ? "HPS found an inferred value correspondence, but it will not use inferred pairing alone to issue a green unchanged result."
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
