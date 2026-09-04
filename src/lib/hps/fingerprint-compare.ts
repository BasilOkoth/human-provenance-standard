import type { HpsAssetFingerprintV1 } from "./fingerprint-client";

export type HpsDerivativeStatus =
  | "exact_original"
  | "verified_derivative"
  | "cross_format_match"
  | "derivative_candidate"
  | "modified_derivative"
  | "unverified";

export type HpsDerivativeAssurance = "cryptographic" | "high" | "medium" | "low" | "none";
export type HpsConfidenceBand = "very_high" | "high" | "medium" | "low" | "none";

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

function hammingHex64(a?: string | null, b?: string | null) {
  if (!a || !b || !/^[a-f0-9]{16}$/i.test(a) || !/^[a-f0-9]{16}$/i.test(b)) return null;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

function sim64(a?: string | null, b?: string | null) {
  const d = hammingHex64(a, b);
  return d === null ? null : 1 - d / 64;
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function visualSimilarity(original: HpsAssetFingerprintV1, candidate: HpsAssetFingerprintV1) {
  const oi = original.visualPageIndexes || [];
  const ci = candidate.visualPageIndexes || [];
  const op = original.visualPHashes || [];
  const cp = candidate.visualPHashes || [];
  const od = original.visualDHashes || [];
  const cd = candidate.visualDHashes || [];

  const originalMap = new Map<number, { p?: string; d?: string }>();
  oi.forEach((page, idx) => originalMap.set(page, { p: op[idx], d: od[idx] }));

  const scores: number[] = [];
  ci.forEach((page, idx) => {
    const left = originalMap.get(page);
    if (!left) return;
    const p = sim64(left.p, cp[idx]);
    const d = sim64(left.d, cd[idx]);
    if (p !== null && d !== null) scores.push(p * 0.7 + d * 0.3);
    else if (p !== null) scores.push(p);
    else if (d !== null) scores.push(d);
  });

  return mean(scores);
}

function mimeFamily(fp: HpsAssetFingerprintV1) {
  const mime = (fp.mimeType || "").toLowerCase();
  const name = (fp.fileName || "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || name.endsWith(".docx")) return "docx";
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name)) return "image";
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("xml")) return "text";
  return "binary";
}

function signalSimilarity(a?: number | null, b?: number | null) {
  if (typeof a !== "number" || typeof b !== "number") return null;
  return Math.max(0, 1 - Math.abs(a - b));
}

function confidenceBand(score: number): HpsConfidenceBand {
  if (score >= 95) return "very_high";
  if (score >= 82) return "high";
  if (score >= 65) return "medium";
  if (score >= 35) return "low";
  return "none";
}

function rounded(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function ocrReliability(fp: HpsAssetFingerprintV1) {
  if (!fp.ocr?.used) return null;
  return typeof fp.ocr.averageConfidence === "number" ? fp.ocr.averageConfidence / 100 : null;
}

function result(
  status: HpsDerivativeStatus,
  assurance: HpsDerivativeAssurance,
  score: number,
  base: Omit<HpsFingerprintComparison, "status" | "assurance" | "confidenceScore" | "confidenceBand">,
): HpsFingerprintComparison {
  const confidenceScore = rounded(score);
  return {
    status,
    assurance,
    confidenceScore,
    confidenceBand: confidenceBand(confidenceScore),
    ...base,
  };
}

export function compareAssetFingerprints(
  original: HpsAssetFingerprintV1,
  candidate: HpsAssetFingerprintV1
): HpsFingerprintComparison {
  const reasons: string[] = [];
  const exactHashMatch = original.exactSha256 === candidate.exactSha256;
  const canonicalTextMatch = original.canonicalTextSha256 && candidate.canonicalTextSha256
    ? original.canonicalTextSha256 === candidate.canonicalTextSha256
    : null;
  const contentCanonicalMatch = original.contentCanonicalSha256 && candidate.contentCanonicalSha256
    ? original.contentCanonicalSha256 === candidate.contentCanonicalSha256
    : null;
  const textSimilarity = sim64(original.textSimHash64, candidate.textSimHash64);
  const contentSimilarity = sim64(original.contentSimHash64, candidate.contentSimHash64);
  const structureSimilarity = sim64(original.structureSimHash64, candidate.structureSimHash64);
  const visual = visualSimilarity(original, candidate);
  const samePageCount = original.pageCount != null && candidate.pageCount != null
    ? original.pageCount === candidate.pageCount
    : null;
  const visualCoverage = Math.min(original.visualCoverage ?? 1, candidate.visualCoverage ?? 1);
  const crossFormat = mimeFamily(original) !== mimeFamily(candidate);
  const ocrInvolved = Boolean(original.ocr?.used || candidate.ocr?.used);
  const signatureSignalSimilarity = signalSimilarity(
    original.markSignals?.signatureLikelihood,
    candidate.markSignals?.signatureLikelihood,
  );
  const stampSignalSimilarity = signalSimilarity(
    original.markSignals?.stampLikelihood,
    candidate.markSignals?.stampLikelihood,
  );
  const ocrQuality = Math.min(
    ocrReliability(original) ?? 1,
    ocrReliability(candidate) ?? 1,
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

  if (exactHashMatch) {
    return result(
      "exact_original",
      "cryptographic",
      100,
      {
        ...base,
        reasons: ["The candidate SHA-256 is byte-for-byte identical to the registered asset."],
      },
    );
  }

  const markMismatch =
    (signatureSignalSimilarity !== null && signatureSignalSimilarity < 0.58) ||
    (stampSignalSimilarity !== null && stampSignalSimilarity < 0.58);

  if (canonicalTextMatch === true) {
    reasons.push("Strict canonical text SHA-256 is identical; wording, numbers, punctuation and order survived normalization.");

    if (crossFormat) {
      let score = ocrInvolved ? 91 : 95;
      if (ocrInvolved && ocrQuality < 0.75) score -= 7;
      if (structureSimilarity !== null && structureSimilarity >= 0.86) {
        score += 2;
        reasons.push(`Document structure similarity is ${(structureSimilarity * 100).toFixed(1)}%.`);
      }
      if (markMismatch) {
        score -= 8;
        reasons.push("Visual signature/stamp signals differ materially; HPS will not treat the presentation as equivalent.");
      }
      reasons.push("The file format differs, so HPS classifies this as a cross-format relationship rather than an exact asset match.");
      return result(
        "cross_format_match",
        score >= 88 ? "high" : "medium",
        score,
        { ...base, presentationChanged: true, reasons },
      );
    }

    if (samePageCount === false) {
      reasons.push("Page count changed, so HPS will not call this a provenance-preserving compression.");
      return result(
        "modified_derivative",
        "medium",
        74,
        { ...base, presentationChanged: true, reasons },
      );
    }

    if (visual !== null && visual >= 0.92 && visualCoverage >= 0.95 && !markMismatch) {
      reasons.push(`Visual fingerprint similarity is ${(visual * 100).toFixed(1)}% with ${(visualCoverage * 100).toFixed(0)}% coverage.`);
      reasons.push("The bytes changed while text and presentation remained consistent with a non-material transformation.");
      return result(
        "verified_derivative",
        "high",
        96,
        { ...base, presentationChanged: false, reasons },
      );
    }

    if (visual !== null && visual >= 0.84) {
      reasons.push(`Canonical text is unchanged, but visual similarity is ${(visual * 100).toFixed(1)}%.`);
      if (markMismatch) reasons.push("Signature/stamp signal changes increase the likelihood of a material presentation change.");
      return result(
        "modified_derivative",
        "medium",
        markMismatch ? 68 : 78,
        { ...base, presentationChanged: true, reasons },
      );
    }

    reasons.push("Text is unchanged, but HPS lacks enough matching visual evidence to certify the whole presentation as unchanged.");
    return result(
      "derivative_candidate",
      "medium",
      72,
      { ...base, presentationChanged: visual !== null, reasons },
    );
  }

  if (contentCanonicalMatch === true) {
    let score = crossFormat ? 91 : 86;
    if (ocrInvolved && ocrQuality < 0.75) score -= 7;
    if (structureSimilarity !== null && structureSimilarity >= 0.84) {
      score += 2;
      reasons.push(`Document structure similarity is ${(structureSimilarity * 100).toFixed(1)}%.`);
    }
    if (markMismatch) score -= 8;
    reasons.push("Cross-format canonical content hash matches after typography, case and whitespace normalization.");
    reasons.push("This is strong content correspondence, not byte-for-byte identity.");
    return result(
      crossFormat ? "cross_format_match" : "derivative_candidate",
      score >= 86 ? "high" : "medium",
      score,
      { ...base, presentationChanged: crossFormat || markMismatch, reasons },
    );
  }

  if (
    crossFormat &&
    contentSimilarity !== null && contentSimilarity >= 0.96 &&
    structureSimilarity !== null && structureSimilarity >= 0.80
  ) {
    let score = 84 + Math.min(6, (contentSimilarity - 0.96) * 100);
    if (ocrInvolved && ocrQuality < 0.70) score -= 8;
    if (markMismatch) score -= 6;
    reasons.push(`Cross-format text similarity is ${(contentSimilarity * 100).toFixed(1)}%.`);
    reasons.push(`Document structure similarity is ${(structureSimilarity * 100).toFixed(1)}%.`);
    reasons.push("OCR/extraction differences prevent an exact canonical hash match, but the content and structure strongly correspond.");
    return result(
      "cross_format_match",
      score >= 84 ? "high" : "medium",
      score,
      { ...base, presentationChanged: true, reasons },
    );
  }

  if (textSimilarity !== null && textSimilarity >= 0.94) {
    let score = 72 + (textSimilarity - 0.94) * 100;
    if (visual !== null && visual >= 0.90) score += 5;
    if (structureSimilarity !== null && structureSimilarity >= 0.85) score += 4;
    if (markMismatch) score -= 7;
    reasons.push(`Text SimHash similarity is ${(textSimilarity * 100).toFixed(1)}%, but the strict canonical text SHA-256 differs.`);
    reasons.push("This suggests a related version, but at least some textual or OCR-normalized content changed.");
    return result(
      "modified_derivative",
      score >= 76 ? "medium" : "low",
      score,
      { ...base, presentationChanged: true, reasons },
    );
  }

  if (visual !== null && visual >= 0.97 && canonicalTextMatch === null && contentCanonicalMatch === null) {
    reasons.push(`Visual similarity is ${(visual * 100).toFixed(1)}%, but there is no trustworthy text layer to cryptographically compare.`);
    reasons.push("HPS treats this as a derivative candidate, not a verified equivalent, because perceptual hashing alone is insufficient.");
    return result(
      "derivative_candidate",
      "low",
      58,
      { ...base, presentationChanged: false, reasons },
    );
  }

  if (
    (visual !== null && visual >= 0.88) ||
    (contentSimilarity !== null && contentSimilarity >= 0.82) ||
    (structureSimilarity !== null && structureSimilarity >= 0.90)
  ) {
    let score = 48;
    if (visual !== null) score += Math.max(0, (visual - 0.88) * 60);
    if (contentSimilarity !== null) score += Math.max(0, (contentSimilarity - 0.82) * 45);
    if (structureSimilarity !== null && structureSimilarity >= 0.90) score += 5;
    reasons.push("The candidate has partial textual, structural or visual similarity to the registered asset, but material changes cannot be excluded.");
    return result(
      "modified_derivative",
      "low",
      score,
      { ...base, presentationChanged: true, reasons },
    );
  }

  return result(
    "unverified",
    "none",
    0,
    {
      ...base,
      reasons: ["No sufficiently strong exact, textual, structural or visual relationship was established."],
    },
  );
}
