/**
 * Deterministic JSON canonicalization for HPS 1.0 signing.
 * This follows the practical JCS/RFC 8785 model for JSON-compatible values:
 * object keys are lexicographically sorted, arrays retain order, and primitive
 * serialization is delegated to JSON.stringify. Do not pass undefined, NaN,
 * Infinity, BigInt, functions or cyclic values.
 */
export function jcsCanonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Value is not JSON serializable.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(jcsCanonicalize).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${jcsCanonicalize(obj[k])}`).join(",")}}`;
  }
  throw new Error("Value is not JSON serializable.");
}

// Backward-compatible alias used by HPS 0.4 records.
export const canonicalize = jcsCanonicalize;
