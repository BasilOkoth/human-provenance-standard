export type HpsTextChangeKind = "inserted" | "deleted" | "replaced";

export type HpsTextChangeCategory =
  | "number"
  | "date"
  | "currency"
  | "percentage"
  | "identifier"
  | "url"
  | "email"
  | "word"
  | "punctuation"
  | "mixed";

export type HpsTextChange = {
  kind: HpsTextChangeKind;
  category: HpsTextChangeCategory;
  material: boolean;
  originalText: string;
  candidateText: string;
  originalTokenIndex: number;
  candidateTokenIndex: number;
  contextBefore: string;
  contextAfter: string;
};

export type HpsTextDiffResult = {
  exactTextMatch: boolean;
  originalTokenCount: number;
  candidateTokenCount: number;
  insertionGroups: number;
  deletionGroups: number;
  replacementGroups: number;
  materialChangeGroups: number;
  changes: HpsTextChange[];
  truncated: boolean;
};

type EditOp = {
  kind: "equal" | "delete" | "insert";
  token: string;
  originalIndex: number;
  candidateIndex: number;
};

const MAX_DP_CELLS = 2_000_000;
const MAX_REPORTED_CHANGES = 100;
const CONTEXT_TOKENS = 7;

function normalizeForDiff(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/-\s*\n\s*(?=[\p{L}])/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function tokenizeDocumentForDiff(text: string) {
  const normalized = normalizeForDiff(text);
  if (!normalized) return [];

  return normalized.match(
    /https?:\/\/[^\s]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:KES|USD|EUR|GBP|KSH|KSh|US\$|[$€£])\s*\d[\d,.]*(?:\.\d+)?|\d+(?:\.\d+)?%|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[^\s]/gu
  ) || [];
}

export function formatDiffTokens(tokens: string[]) {
  if (!tokens.length) return "";
  return tokens
    .join(" ")
    .replace(/\s+([,.;:!?%\)\]\}])/g, "$1")
    .replace(/([\(\[\{])\s+/g, "$1")
    .replace(/([$€£])\s+(?=\d)/g, "$1")
    .trim();
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isDate(value: string) {
  return /^(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})$/u.test(value);
}

function isPercentage(value: string) {
  return /^[+-]?\d+(?:[.,]\d+)?%$/u.test(value);
}

function isCurrency(value: string) {
  return /^(?:(?:KES|USD|EUR|GBP|KSH|KSh|US\$)\s*|[$€£])\d[\d,.]*(?:\.\d+)?$/u.test(value);
}

function isNumber(value: string) {
  return /^[+-]?\d+(?:[.,:/-]\d+)*$/u.test(value);
}

function isIdentifier(value: string) {
  return /^(?=.{5,}$)(?=.*\p{L})(?=.*\d)[\p{L}\p{N}._/-]+$/u.test(value);
}

function isWord(value: string) {
  return /^\p{L}+(?:['-]\p{L}+)*$/u.test(value);
}

function categoryForTokens(tokens: string[]): HpsTextChangeCategory {
  const compact = formatDiffTokens(tokens);
  if (tokens.length === 1) {
    const value = tokens[0];
    if (isUrl(value)) return "url";
    if (isEmail(value)) return "email";
    if (isCurrency(value)) return "currency";
    if (isPercentage(value)) return "percentage";
    if (isDate(value)) return "date";
    if (isNumber(value)) return "number";
    if (isIdentifier(value)) return "identifier";
    if (isWord(value)) return "word";
    return "punctuation";
  }

  if (isCurrency(compact)) return "currency";
  if (isPercentage(compact)) return "percentage";
  if (isDate(compact)) return "date";

  const categories = new Set(tokens.map(token => categoryForTokens([token])));
  if (categories.size === 1) return [...categories][0];
  return "mixed";
}

function containsMaterialToken(tokens: string[]) {
  return tokens.some(token =>
    isUrl(token) ||
    isEmail(token) ||
    isCurrency(token) ||
    isPercentage(token) ||
    isDate(token) ||
    isNumber(token) ||
    isIdentifier(token)
  );
}

function buildOps(
  original: string[],
  candidate: string[],
  originalOffset: number,
  candidateOffset: number,
) {
  const n = original.length;
  const m = candidate.length;

  if (!n && !m) return { ops: [] as EditOp[], truncated: false };
  if (!n) {
    return {
      ops: candidate.map((token, j) => ({
        kind: "insert" as const,
        token,
        originalIndex: originalOffset,
        candidateIndex: candidateOffset + j,
      })),
      truncated: false,
    };
  }
  if (!m) {
    return {
      ops: original.map((token, i) => ({
        kind: "delete" as const,
        token,
        originalIndex: originalOffset + i,
        candidateIndex: candidateOffset,
      })),
      truncated: false,
    };
  }

  if (n * m > MAX_DP_CELLS) {
    return {
      ops: [
        ...original.map((token, i) => ({
          kind: "delete" as const,
          token,
          originalIndex: originalOffset + i,
          candidateIndex: candidateOffset,
        })),
        ...candidate.map((token, j) => ({
          kind: "insert" as const,
          token,
          originalIndex: originalOffset + n,
          candidateIndex: candidateOffset + j,
        })),
      ],
      truncated: true,
    };
  }

  const width = m + 1;
  const dp = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * width + j;

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = original[i] === candidate[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  const ops: EditOp[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && original[i] === candidate[j]) {
      ops.push({
        kind: "equal",
        token: original[i],
        originalIndex: originalOffset + i,
        candidateIndex: candidateOffset + j,
      });
      i++;
      j++;
      continue;
    }

    if (j < m && (i >= n || dp[at(i, j + 1)] > dp[at(i + 1, j)])) {
      ops.push({
        kind: "insert",
        token: candidate[j],
        originalIndex: originalOffset + i,
        candidateIndex: candidateOffset + j,
      });
      j++;
    } else if (i < n) {
      ops.push({
        kind: "delete",
        token: original[i],
        originalIndex: originalOffset + i,
        candidateIndex: candidateOffset + j,
      });
      i++;
    }
  }

  return { ops, truncated: false };
}

export function diffDocumentText(originalText: string, candidateText: string): HpsTextDiffResult {
  const original = tokenizeDocumentForDiff(originalText);
  const candidate = tokenizeDocumentForDiff(candidateText);

  let prefix = 0;
  while (
    prefix < original.length &&
    prefix < candidate.length &&
    original[prefix] === candidate[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < candidate.length - prefix &&
    original[original.length - 1 - suffix] === candidate[candidate.length - 1 - suffix]
  ) {
    suffix++;
  }

  if (prefix === original.length && prefix === candidate.length) {
    return {
      exactTextMatch: true,
      originalTokenCount: original.length,
      candidateTokenCount: candidate.length,
      insertionGroups: 0,
      deletionGroups: 0,
      replacementGroups: 0,
      materialChangeGroups: 0,
      changes: [],
      truncated: false,
    };
  }

  const originalMiddle = original.slice(prefix, original.length - suffix);
  const candidateMiddle = candidate.slice(prefix, candidate.length - suffix);
  const { ops, truncated: algorithmTruncated } = buildOps(
    originalMiddle,
    candidateMiddle,
    prefix,
    prefix,
  );

  const changes: HpsTextChange[] = [];
  let pos = 0;

  while (pos < ops.length) {
    if (ops[pos].kind === "equal") {
      pos++;
      continue;
    }

    const group: EditOp[] = [];
    while (pos < ops.length && ops[pos].kind !== "equal") {
      group.push(ops[pos]);
      pos++;
    }

    const deleted = group.filter(op => op.kind === "delete").map(op => op.token);
    const inserted = group.filter(op => op.kind === "insert").map(op => op.token);
    const kind: HpsTextChangeKind = deleted.length && inserted.length
      ? "replaced"
      : deleted.length
        ? "deleted"
        : "inserted";

    const first = group[0];
    const originalIndex = first.originalIndex;
    const candidateIndex = first.candidateIndex;
    const category = categoryForTokens([...deleted, ...inserted]);
    const material = containsMaterialToken([...deleted, ...inserted]);

    const deletedCount = deleted.length;
    const contextBefore = formatDiffTokens(
      original.slice(Math.max(0, originalIndex - CONTEXT_TOKENS), originalIndex)
    );
    const contextAfter = formatDiffTokens(
      original.slice(
        Math.min(original.length, originalIndex + deletedCount),
        Math.min(original.length, originalIndex + deletedCount + CONTEXT_TOKENS),
      )
    );

    changes.push({
      kind,
      category,
      material,
      originalText: formatDiffTokens(deleted),
      candidateText: formatDiffTokens(inserted),
      originalTokenIndex: originalIndex,
      candidateTokenIndex: candidateIndex,
      contextBefore,
      contextAfter,
    });
  }

  const reported = changes.slice(0, MAX_REPORTED_CHANGES);

  return {
    exactTextMatch: false,
    originalTokenCount: original.length,
    candidateTokenCount: candidate.length,
    insertionGroups: changes.filter(change => change.kind === "inserted").length,
    deletionGroups: changes.filter(change => change.kind === "deleted").length,
    replacementGroups: changes.filter(change => change.kind === "replaced").length,
    materialChangeGroups: changes.filter(change => change.material).length,
    changes: reported,
    truncated: algorithmTruncated || changes.length > MAX_REPORTED_CHANGES,
  };
}
