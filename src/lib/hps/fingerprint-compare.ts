import type { HpsAssetFingerprintV1 } from "./fingerprint-client";

export type HpsDerivativeStatus =
  | "exact_original"
  | "verified_derivative"
  | "derivative_candidate"
  | "modified_derivative"
  | "unverified";

export type HpsDerivativeAssurance = "cryptographic" | "high" | "medium" | "low" | "none";

export type HpsFingerprintComparison = {
  status: HpsDerivativeStatus;
  assurance: HpsDerivativeAssurance;
  exactHashMatch: boolean;
  canonicalTextMatch: boolean | null;
  textSimilarity: number | null;
  visualSimilarity: number | null;
  samePageCount: boolean | null;
  visualCoverage: number | null;
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

function isPureTextAsset(fp: HpsAssetFingerprintV1) {
  const mime = (fp.mimeType || "").toLowerCase();
  return fp.modality === "text" && (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  );
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
  const textSimilarity = sim64(original.textSimHash64, candidate.textSimHash64);
  const visual = visualSimilarity(original, candidate);
  const samePageCount = original.pageCount != null && candidate.pageCount != null
    ? original.pageCount === candidate.pageCount
    : null;
  const visualCoverage = Math.min(original.visualCoverage ?? 1, candidate.visualCoverage ?? 1);

  if (exactHashMatch) {
    return {
      status: "exact_original",
      assurance: "cryptographic",
      exactHashMatch: true,
      canonicalTextMatch,
      textSimilarity,
      visualSimilarity: visual,
      samePageCount,
      visualCoverage,
      presentationChanged: false,
      reasons: ["The candidate SHA-256 is byte-for-byte identical to the registered asset."],
    };
  }

  if (canonicalTextMatch === true) {
    reasons.push("Canonical text SHA-256 is identical; wording, numbers, punctuation and order survived normalization.");

    if (samePageCount === false) {
      reasons.push("Page count changed, so HPS will not call this a provenance-preserving compression.");
      return {
        status: "modified_derivative", assurance: "medium", exactHashMatch, canonicalTextMatch,
        textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
        presentationChanged: true, reasons,
      };
    }

    if (isPureTextAsset(original) && isPureTextAsset(candidate)) {
      reasons.push("This is a text-only asset; exact canonical text is sufficient for compression/encoding-resilient equivalence.");
      return {
        status: "verified_derivative", assurance: "high", exactHashMatch, canonicalTextMatch,
        textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
        presentationChanged: false, reasons,
      };
    }

    if (visual !== null && visual >= 0.92 && visualCoverage >= 0.95) {
      reasons.push(`Visual fingerprint similarity is ${(visual * 100).toFixed(1)}% with ${(visualCoverage * 100).toFixed(0)}% visual coverage.`);
      reasons.push("The file bytes changed, but text and presentation remain consistent with a non-material transformation such as compression or optimization.");
      return {
        status: "verified_derivative", assurance: "high", exactHashMatch, canonicalTextMatch,
        textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
        presentationChanged: false, reasons,
      };
    }

    if (visual !== null && visual >= 0.84) {
      reasons.push(`Canonical text is unchanged, but visual similarity is only ${(visual * 100).toFixed(1)}%.`);
      reasons.push("HPS can establish a relationship, but a presentation/image/signature-layer change may have occurred.");
      return {
        status: "modified_derivative", assurance: "medium", exactHashMatch, canonicalTextMatch,
        textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
        presentationChanged: true, reasons,
      };
    }

    reasons.push("Text is unchanged, but HPS lacks enough matching visual evidence to certify the whole document as unchanged.");
    return {
      status: "derivative_candidate", assurance: "medium", exactHashMatch, canonicalTextMatch,
      textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
      presentationChanged: visual !== null, reasons,
    };
  }

  if (textSimilarity !== null && textSimilarity >= 0.94) {
    reasons.push(`Text SimHash similarity is ${(textSimilarity * 100).toFixed(1)}%, but the canonical text SHA-256 differs.`);
    reasons.push("This strongly suggests a related version, but at least some textual content changed.");
    return {
      status: "modified_derivative", assurance: visual !== null && visual >= 0.90 ? "medium" : "low",
      exactHashMatch, canonicalTextMatch, textSimilarity, visualSimilarity: visual, samePageCount,
      visualCoverage, presentationChanged: true, reasons,
    };
  }

  if (visual !== null && visual >= 0.97 && (canonicalTextMatch === null)) {
    reasons.push(`Visual similarity is ${(visual * 100).toFixed(1)}%, but there is no trustworthy text layer to cryptographically compare.`);
    reasons.push("HPS treats this as a derivative candidate, not a verified equivalent, to avoid false assurance from perceptual hashing alone.");
    return {
      status: "derivative_candidate", assurance: "low", exactHashMatch, canonicalTextMatch,
      textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
      presentationChanged: false, reasons,
    };
  }

  if ((visual !== null && visual >= 0.88) || (textSimilarity !== null && textSimilarity >= 0.82)) {
    reasons.push("The candidate has partial similarity to the registered asset, but material changes cannot be excluded.");
    return {
      status: "modified_derivative", assurance: "low", exactHashMatch, canonicalTextMatch,
      textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
      presentationChanged: true, reasons,
    };
  }

  return {
    status: "unverified", assurance: "none", exactHashMatch, canonicalTextMatch,
    textSimilarity, visualSimilarity: visual, samePageCount, visualCoverage,
    presentationChanged: false,
    reasons: ["No sufficiently strong exact, textual or visual relationship was established."],
  };
}
