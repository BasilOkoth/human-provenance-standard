import type { HpsAssetFingerprintV1 } from "./fingerprint-client";

export type HpsDerivativeStatus =
  | "exact_original"
  | "verified_derivative"
  | "cross_format_match"
  | "derivative_candidate"
  | "modified_derivative"
  | "unverified";

export type HpsDerivativeAssurance =
  | "cryptographic"
  | "high"
  | "medium"
  | "low"
  | "none";

export type HpsConfidenceBand =
  | "very_high"
  | "high"
  | "medium"
  | "low"
  | "none";

export type HpsFingerprintComparison = {
  status: HpsDerivativeStatus;
  assurance: HpsDerivativeAssurance;
  confidenceScore: number;
  confidenceBand: HpsConfidenceBand;
  exactHashMatch: boolean;
  canonicalTextMatch: boolean | null;
  contentCanonicalMatch: boolean | null;
  textSimilarity: number | null;
  contentSimilarity: number | null;
  structureSimilarity: number | null;
  visualSimilarity: number | null;
  signatureSignalSimilarity: number | null;
  stampSignalSimilarity: number | null;
  samePageCount: boolean | null;
  visualCoverage: number | null;
  crossFormat: boolean;
  ocrInvolved: boolean;
  presentationChanged: boolean;
  reasons: string[];
};

/*
 * HPS relationship policy
 * -----------------------
 *
 * 1. Exact SHA-256 is definitive asset identity.
 * 2. Canonical text/content hashes are strong provenance evidence.
 * 3. High semantic/text similarity may establish a likely related version.
 * 4. Visual similarity can support a relationship, especially when no text
 *    layer exists, but perceptual hashes are not cryptographic proof.
 * 5. DOCUMENT STRUCTURE IS NEVER SUFFICIENT ON ITS OWN TO ESTABLISH DERIVATION.
 *
 * This last rule is important: unrelated papers, contracts, applications,
 * reports and forms often share headings, page counts, paragraph density,
 * and other structural patterns.
 */

const THRESHOLDS = {
  TEXT_STRONG: 0.94,
  TEXT_SUPPORTING: 0.90,

  CONTENT_CROSS_FORMAT_STRONG: 0.96,
  CONTENT_LIKELY_RELATED: 0.88,
  CONTENT_WEAK: 0.82,

  STRUCTURE_SUPPORTING: 0.82,
  STRUCTURE_HIGH: 0.90,

  VISUAL_VERIFIED: 0.92,
  VISUAL_STRONG: 0.90,
  VISUAL_MODERATE: 0.88,
  VISUAL_ONLY_CANDIDATE: 0.97,

  MARK_MISMATCH: 0.58,
  OCR_HIGH_CONFIDENCE: 0.75,
  OCR_MIN_CROSS_FORMAT_CONFIDENCE: 0.70,
} as const;

function hammingHex64(a?: string | null, b?: string | null) {
  if (
    !a ||
    !b ||
    !/^[a-f0-9]{16}$/i.test(a) ||
    !/^[a-f0-9]{16}$/i.test(b)
  ) {
    return null;
  }

  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;

  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }

  return count;
}

function sim64(a?: string | null, b?: string | null) {
  const distance = hammingHex64(a, b);
  return distance === null ? null : 1 - distance / 64;
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

function visualSimilarity(
  original: HpsAssetFingerprintV1,
  candidate: HpsAssetFingerprintV1
) {
  const originalIndexes = original.visualPageIndexes || [];
  const candidateIndexes = candidate.visualPageIndexes || [];
  const originalPHashes = original.visualPHashes || [];
  const candidatePHashes = candidate.visualPHashes || [];
  const originalDHashes = original.visualDHashes || [];
  const candidateDHashes = candidate.visualDHashes || [];

  const originalMap = new Map<
    number,
    { p?: string; d?: string }
  >();

  originalIndexes.forEach((page, index) => {
    originalMap.set(page, {
      p: originalPHashes[index],
      d: originalDHashes[index],
    });
  });

  const scores: number[] = [];

  candidateIndexes.forEach((page, index) => {
    const left = originalMap.get(page);
    if (!left) return;

    const p = sim64(left.p, candidatePHashes[index]);
    const d = sim64(left.d, candidateDHashes[index]);

    if (p !== null && d !== null) {
      scores.push(p * 0.7 + d * 0.3);
    } else if (p !== null) {
      scores.push(p);
    } else if (d !== null) {
      scores.push(d);
    }
  });

  return mean(scores);
}

function mimeFamily(fp: HpsAssetFingerprintV1) {
  const mime = (fp.mimeType || "").toLowerCase();
  const name = (fp.fileName || "").toLowerCase();

  if (
    mime === "application/pdf" ||
    name.endsWith(".pdf")
  ) {
    return "pdf";
  }

  if (
    mime.includes("wordprocessingml") ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }

  if (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp)$/i.test(name)
  ) {
    return "image";
  }

  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml")
  ) {
    return "text";
  }

  return "binary";
}

function signalSimilarity(
  a?: number | null,
  b?: number | null
) {
  if (
    typeof a !== "number" ||
    typeof b !== "number"
  ) {
    return null;
  }

  return Math.max(0, 1 - Math.abs(a - b));
}

function confidenceBand(
  score: number
): HpsConfidenceBand {
  if (score >= 95) return "very_high";
  if (score >= 82) return "high";
  if (score >= 65) return "medium";
  if (score >= 35) return "low";
  return "none";
}

function rounded(score: number) {
  return Math.max(
    0,
    Math.min(100, Math.round(score))
  );
}

function ocrReliability(
  fp: HpsAssetFingerprintV1
) {
  if (!fp.ocr?.used) return null;

  return typeof fp.ocr.averageConfidence === "number"
    ? fp.ocr.averageConfidence / 100
    : null;
}

function result(
  status: HpsDerivativeStatus,
  assurance: HpsDerivativeAssurance,
  score: number,
  base: Omit<
    HpsFingerprintComparison,
    | "status"
    | "assurance"
    | "confidenceScore"
    | "confidenceBand"
  >
): HpsFingerprintComparison {
  const confidenceScore = rounded(score);

  return {
    status,
    assurance,
    confidenceScore,
    confidenceBand:
      confidenceBand(confidenceScore),
    ...base,
  };
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function compareAssetFingerprints(
  original: HpsAssetFingerprintV1,
  candidate: HpsAssetFingerprintV1
): HpsFingerprintComparison {
  const reasons: string[] = [];

  const exactHashMatch =
    original.exactSha256 ===
    candidate.exactSha256;

  const canonicalTextMatch =
    original.canonicalTextSha256 &&
    candidate.canonicalTextSha256
      ? original.canonicalTextSha256 ===
        candidate.canonicalTextSha256
      : null;

  const contentCanonicalMatch =
    original.contentCanonicalSha256 &&
    candidate.contentCanonicalSha256
      ? original.contentCanonicalSha256 ===
        candidate.contentCanonicalSha256
      : null;

  const textSimilarity = sim64(
    original.textSimHash64,
    candidate.textSimHash64
  );

  const contentSimilarity = sim64(
    original.contentSimHash64,
    candidate.contentSimHash64
  );

  const structureSimilarity = sim64(
    original.structureSimHash64,
    candidate.structureSimHash64
  );

  const visual = visualSimilarity(
    original,
    candidate
  );

  const samePageCount =
    original.pageCount != null &&
    candidate.pageCount != null
      ? original.pageCount === candidate.pageCount
      : null;

  const visualCoverage = Math.min(
    original.visualCoverage ?? 1,
    candidate.visualCoverage ?? 1
  );

  const crossFormat =
    mimeFamily(original) !==
    mimeFamily(candidate);

  const ocrInvolved = Boolean(
    original.ocr?.used ||
    candidate.ocr?.used
  );

  const signatureSignalSimilarity =
    signalSimilarity(
      original.markSignals?.signatureLikelihood,
      candidate.markSignals?.signatureLikelihood
    );

  const stampSignalSimilarity =
    signalSimilarity(
      original.markSignals?.stampLikelihood,
      candidate.markSignals?.stampLikelihood
    );

  const ocrQuality = Math.min(
    ocrReliability(original) ?? 1,
    ocrReliability(candidate) ?? 1
  );

  const base = {
    exactHashMatch,
    canonicalTextMatch,
    contentCanonicalMatch,
    textSimilarity,
    contentSimilarity,
    structureSimilarity,
    visualSimilarity: visual,
    signatureSignalSimilarity,
    stampSignalSimilarity,
    samePageCount,
    visualCoverage,
    crossFormat,
    ocrInvolved,
    presentationChanged: false,
    reasons,
  };

  /*
   * ---------------------------------------------------------
   * 01. EXACT DIGITAL ASSET
   * ---------------------------------------------------------
   */
  if (exactHashMatch) {
    return result(
      "exact_original",
      "cryptographic",
      100,
      {
        ...base,
        reasons: [
          "The candidate SHA-256 is byte-for-byte identical to the registered asset.",
        ],
      }
    );
  }

  const markMismatch =
    (
      signatureSignalSimilarity !== null &&
      signatureSignalSimilarity <
        THRESHOLDS.MARK_MISMATCH
    ) ||
    (
      stampSignalSimilarity !== null &&
      stampSignalSimilarity <
        THRESHOLDS.MARK_MISMATCH
    );

  /*
   * ---------------------------------------------------------
   * 02. STRICT CANONICAL TEXT MATCH
   * ---------------------------------------------------------
   *
   * Same normalized wording/order is strong evidence even
   * when the file bytes or format changed.
   */
  if (canonicalTextMatch === true) {
    reasons.push(
      "Strict canonical text SHA-256 is identical; wording, numbers, punctuation and order survived normalization."
    );

    if (crossFormat) {
      let score =
        ocrInvolved ? 91 : 95;

      if (
        ocrInvolved &&
        ocrQuality <
          THRESHOLDS.OCR_HIGH_CONFIDENCE
      ) {
        score -= 7;
        reasons.push(
          "OCR confidence is limited, so HPS reduces assurance."
        );
      }

      if (
        structureSimilarity !== null &&
        structureSimilarity >=
          THRESHOLDS.STRUCTURE_SUPPORTING
      ) {
        score += 1;
        reasons.push(
          `Document structure similarity is ${pct(
            structureSimilarity
          )}; structure is supporting evidence only.`
        );
      }

      if (markMismatch) {
        score -= 8;
        reasons.push(
          "Visual signature/stamp signals differ materially; HPS will not treat the presentation as equivalent."
        );
      }

      reasons.push(
        "The file format differs, so HPS classifies this as a cross-format relationship rather than an exact asset match."
      );

      return result(
        "cross_format_match",
        score >= 88 ? "high" : "medium",
        score,
        {
          ...base,
          presentationChanged: true,
          reasons,
        }
      );
    }

    if (samePageCount === false) {
      reasons.push(
        "Page count changed. The text is unchanged, but the presentation or pagination changed materially."
      );

      return result(
        "modified_derivative",
        "medium",
        74,
        {
          ...base,
          presentationChanged: true,
          reasons,
        }
      );
    }

    if (
      visual !== null &&
      visual >= THRESHOLDS.VISUAL_VERIFIED &&
      visualCoverage >= 0.95 &&
      !markMismatch
    ) {
      reasons.push(
        `Visual fingerprint similarity is ${pct(
          visual
        )} with ${Math.round(
          visualCoverage * 100
        )}% coverage.`
      );

      reasons.push(
        "The bytes changed while the canonical text and presentation remained strongly consistent."
      );

      return result(
        "verified_derivative",
        "high",
        96,
        {
          ...base,
          presentationChanged: false,
          reasons,
        }
      );
    }

    if (
      visual !== null &&
      visual >= THRESHOLDS.VISUAL_MODERATE
    ) {
      reasons.push(
        `Canonical text is unchanged, while visual similarity is ${pct(
          visual
        )}.`
      );

      if (markMismatch) {
        reasons.push(
          "Signature/stamp signal changes increase the likelihood of a material presentation change."
        );
      }

      return result(
        "modified_derivative",
        "medium",
        markMismatch ? 68 : 78,
        {
          ...base,
          presentationChanged: true,
          reasons,
        }
      );
    }

    reasons.push(
      "Text is unchanged, but HPS lacks enough matching visual evidence to certify the whole presentation as unchanged."
    );

    return result(
      "derivative_candidate",
      "medium",
      72,
      {
        ...base,
        presentationChanged:
          visual !== null,
        reasons,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 03. CANONICAL CONTENT MATCH
   * ---------------------------------------------------------
   *
   * This is a strong content-level match after typography,
   * case and whitespace normalization.
   */
  if (contentCanonicalMatch === true) {
    let score =
      crossFormat ? 91 : 86;

    if (
      ocrInvolved &&
      ocrQuality <
        THRESHOLDS.OCR_HIGH_CONFIDENCE
    ) {
      score -= 7;
      reasons.push(
        "OCR confidence is limited, so HPS reduces assurance."
      );
    }

    if (
      structureSimilarity !== null &&
      structureSimilarity >=
        THRESHOLDS.STRUCTURE_SUPPORTING
    ) {
      score += 1;
      reasons.push(
        `Document structure similarity is ${pct(
          structureSimilarity
        )}; this is supporting evidence only.`
      );
    }

    if (markMismatch) {
      score -= 8;
    }

    reasons.push(
      "Cross-format canonical content hash matches after typography, case and whitespace normalization."
    );

    reasons.push(
      "This is strong content correspondence, not byte-for-byte identity."
    );

    return result(
      crossFormat
        ? "cross_format_match"
        : "derivative_candidate",
      score >= 86 ? "high" : "medium",
      score,
      {
        ...base,
        presentationChanged:
          crossFormat || markMismatch,
        reasons,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 04. STRONG CROSS-FORMAT CONTENT CORRESPONDENCE
   * ---------------------------------------------------------
   */
  if (
    crossFormat &&
    contentSimilarity !== null &&
    contentSimilarity >=
      THRESHOLDS.CONTENT_CROSS_FORMAT_STRONG &&
    structureSimilarity !== null &&
    structureSimilarity >=
      THRESHOLDS.STRUCTURE_SUPPORTING
  ) {
    let score =
      84 +
      Math.min(
        6,
        (
          contentSimilarity -
          THRESHOLDS.CONTENT_CROSS_FORMAT_STRONG
        ) * 100
      );

    if (
      ocrInvolved &&
      ocrQuality <
        THRESHOLDS.OCR_MIN_CROSS_FORMAT_CONFIDENCE
    ) {
      score -= 8;
    }

    if (markMismatch) {
      score -= 6;
    }

    reasons.push(
      `Cross-format content similarity is ${pct(
        contentSimilarity
      )}.`
    );

    reasons.push(
      `Document structure similarity is ${pct(
        structureSimilarity
      )}; structure strengthens an already strong content match but does not create the relationship.`
    );

    reasons.push(
      "OCR/extraction differences prevent an exact canonical hash match, but the content strongly corresponds."
    );

    return result(
      "cross_format_match",
      score >= 84 ? "high" : "medium",
      score,
      {
        ...base,
        presentationChanged: true,
        reasons,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 05. STRONG TEXT SIMILARITY WITH CHANGED CANONICAL TEXT
   * ---------------------------------------------------------
   *
   * This is appropriate for edited versions where most wording
   * survived but exact text integrity changed.
   */
  if (
    textSimilarity !== null &&
    textSimilarity >= THRESHOLDS.TEXT_STRONG
  ) {
    let score =
      72 +
      (
        textSimilarity -
        THRESHOLDS.TEXT_STRONG
      ) * 100;

    if (
      visual !== null &&
      visual >= THRESHOLDS.VISUAL_STRONG
    ) {
      score += 4;
    }

    if (
      structureSimilarity !== null &&
      structureSimilarity >=
        THRESHOLDS.STRUCTURE_SUPPORTING
    ) {
      score += 2;
    }

    if (markMismatch) {
      score -= 7;
    }

    reasons.push(
      `Text SimHash similarity is ${pct(
        textSimilarity
      )}, but strict canonical text SHA-256 differs.`
    );

    reasons.push(
      "This is consistent with a related version containing textual changes."
    );

    if (
      structureSimilarity !== null &&
      structureSimilarity >=
        THRESHOLDS.STRUCTURE_HIGH
    ) {
      reasons.push(
        `Structure similarity is ${pct(
          structureSimilarity
        )}, but structure is only supporting evidence.`
      );
    }

    return result(
      "modified_derivative",
      score >= 76 ? "medium" : "low",
      score,
      {
        ...base,
        presentationChanged: true,
        reasons,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 06. VISUAL-ONLY RELATIONSHIP
   * ---------------------------------------------------------
   *
   * Used when no trustworthy text hashes are available.
   * This remains a candidate, never a verified derivative.
   */
  if (
    visual !== null &&
    visual >=
      THRESHOLDS.VISUAL_ONLY_CANDIDATE &&
    canonicalTextMatch === null &&
    contentCanonicalMatch === null
  ) {
    reasons.push(
      `Visual similarity is ${pct(
        visual
      )}, but there is no trustworthy text layer to cryptographically compare.`
    );

    reasons.push(
      "HPS treats this as a derivative candidate, not a verified equivalent, because perceptual hashing alone is insufficient."
    );

    return result(
      "derivative_candidate",
      "low",
      58,
      {
        ...base,
        presentationChanged: false,
        reasons,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 07. COMBINED MODERATE EVIDENCE
   * ---------------------------------------------------------
   *
   * A relationship is only surfaced when content similarity
   * is already meaningful AND another independent signal
   * supports it.
   *
   * Structure cannot trigger this branch by itself.
   */
  const hasMeaningfulContent =
    contentSimilarity !== null &&
    contentSimilarity >=
      THRESHOLDS.CONTENT_LIKELY_RELATED;

  const hasSupportingText =
    textSimilarity !== null &&
    textSimilarity >=
      THRESHOLDS.TEXT_SUPPORTING;

  const hasSupportingVisual =
    visual !== null &&
    visual >=
      THRESHOLDS.VISUAL_MODERATE;

  const hasSupportingStructure =
    structureSimilarity !== null &&
    structureSimilarity >=
      THRESHOLDS.STRUCTURE_SUPPORTING;

  if (
    hasMeaningfulContent &&
    (
      hasSupportingText ||
      hasSupportingVisual ||
      hasSupportingStructure
    )
  ) {
    let score = 60;

    score += Math.max(
      0,
      (
        contentSimilarity! -
        THRESHOLDS.CONTENT_LIKELY_RELATED
      ) * 80
    );

    if (hasSupportingText) {
      score += 3;
    }

    if (hasSupportingVisual) {
      score += 3;
    }

    if (hasSupportingStructure) {
      score += 1;
    }

    if (markMismatch) {
      score -= 5;
    }

    reasons.push(
      `Content similarity is ${pct(
        contentSimilarity!
      )}.`
    );

    if (hasSupportingText) {
      reasons.push(
        `Text similarity is ${pct(
          textSimilarity!
        )}.`
      );
    }

    if (hasSupportingVisual) {
      reasons.push(
        `Visual similarity is ${pct(
          visual!
        )}.`
      );
    }

    if (hasSupportingStructure) {
      reasons.push(
        `Structure similarity is ${pct(
          structureSimilarity!
        )}; structure is only supporting evidence.`
      );
    }

    reasons.push(
      "The signals suggest a possible relationship, but HPS does not have enough evidence to certify derivation."
    );

    return result(
      "derivative_candidate",
      score >= 65 ? "medium" : "low",
      score,
      {
        ...base,
        presentationChanged: true,
        reasons,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 08. WEAK CONTENT OR STRUCTURE-ONLY SIMILARITY
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * These signals may be interesting diagnostically, but they
   * are insufficient to establish provenance and therefore
   * must not become a derivative relationship.
   */
  if (
    contentSimilarity !== null &&
    contentSimilarity >= THRESHOLDS.CONTENT_WEAK
  ) {
    reasons.push(
      `Some content similarity was detected (${pct(
        contentSimilarity
      )}), but it is below the threshold required to establish a provenance relationship.`
    );
  }

  if (
    structureSimilarity !== null &&
    structureSimilarity >=
      THRESHOLDS.STRUCTURE_HIGH
  ) {
    reasons.push(
      `Document structure similarity is high (${pct(
        structureSimilarity
      )}), but structure alone is insufficient to establish derivation.`
    );
  }

  if (
    visual !== null &&
    visual >= THRESHOLDS.VISUAL_MODERATE
  ) {
    reasons.push(
      `Some visual similarity was detected (${pct(
        visual
      )}), but the available content evidence is insufficient to establish provenance.`
    );
  }

  /*
   * ---------------------------------------------------------
   * 09. NO ESTABLISHED RELATIONSHIP
   * ---------------------------------------------------------
   */
  return result(
    "unverified",
    "none",
    0,
    {
      ...base,
      reasons:
        reasons.length > 0
          ? reasons
          : [
              "No sufficiently strong exact, textual, content or visual relationship was established.",
            ],
    }
  );
}
