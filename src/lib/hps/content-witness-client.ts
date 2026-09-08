"use client";

import { extractLocalDocumentText } from "./local-text-extract";
import { tokenizeDocumentForDiff } from "./text-diff";
import type {
  ContentIntegrityWitness,
  ContentWitnessCategory,
  ContentWitnessEntry,
  ContentWitnessMode,
} from "./content-witness-schema";

const MAX_ENTRIES = 250;
const MAX_PUBLIC_TEXT_CHARS = 250_000;
const CONTEXT_WORDS_BEFORE = 6;
const CONTEXT_WORDS_AFTER = 4;

type Match = {
  category: ContentWitnessCategory;
  value: string;
  start: number;
  end: number;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Buffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return bytesToHex(new Uint8Array(digest));
}

function words(value: string) {
  return value.toLocaleLowerCase().match(/[\p{L}]+(?:['-][\p{L}]+)*/gu) || [];
}

function normalizePublicWitnessText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/-\s*\n\s*(?=[\p{L}])/gu, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

function normalizeValue(category: ContentWitnessCategory, value: string) {
  const trimmed = value
    .normalize("NFKC")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (category === "currency") {
    return trimmed.replace(/\s+/g, "").replace(/,/g, "").toUpperCase();
  }

  if (category === "percentage") {
    return trimmed.replace(/\s+/g, "").replace(/,/g, ".");
  }

  if (category === "number") {
    return trimmed.replace(/,/g, "");
  }

  return trimmed.toLocaleLowerCase();
}

function pageNumberNoise(text: string, start: number, end: number) {
  const near = text.slice(Math.max(0, start - 18), Math.min(text.length, end + 18));
  return /\bpage\s+\d+\s+(?:of|\/)\s+\d+\b/i.test(near);
}

function overlaps(match: Match, accepted: Match[]) {
  return accepted.some(
    existing => match.start < existing.end && match.end > existing.start
  );
}

function collectMatches(text: string) {
  const accepted: Match[] = [];

  const patterns: Array<[ContentWitnessCategory, RegExp]> = [
    [
      "currency",
      /(?:KES|KSH|KSh|USD|EUR|GBP|US\$|[$€£])\s*\d[\d,]*(?:\.\d+)?/gu,
    ],
    ["percentage", /\b\d+(?:[.,]\d+)?\s*%/gu],
    [
      "date",
      /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/gu,
    ],
    [
      "date",
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/giu,
    ],
    ["number", /\b\d+(?:[.,]\d+)?\b/gu],
  ];

  for (const [category, regex] of patterns) {
    regex.lastIndex = 0;
    let result: RegExpExecArray | null;

    while ((result = regex.exec(text)) !== null) {
      const match: Match = {
        category,
        value: result[0],
        start: result.index,
        end: result.index + result[0].length,
      };

      if (pageNumberNoise(text, match.start, match.end)) continue;
      if (overlaps(match, accepted)) continue;
      accepted.push(match);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

async function witnessEntries(text: string) {
  const matches = collectMatches(text);
  const occurrences = new Map<string, number>();
  const entries: ContentWitnessEntry[] = [];

  for (const match of matches.slice(0, MAX_ENTRIES)) {
    const before = words(text.slice(Math.max(0, match.start - 220), match.start))
      .slice(-CONTEXT_WORDS_BEFORE);
    const after = words(text.slice(match.end, Math.min(text.length, match.end + 180)))
      .slice(0, CONTEXT_WORDS_AFTER);

    const context = [...before, "__VALUE__", ...after].join(" ");
    const anchorHash = await sha256Text(`${match.category}|${context}`);

    const labelWords = before.slice(-3);
    const label = labelWords.length
      ? labelWords.join(" ")
      : after.slice(0, 3).join(" ");

    const occurrenceKey = `${match.category}|${anchorHash}`;
    const occurrence = occurrences.get(occurrenceKey) || 0;
    occurrences.set(occurrenceKey, occurrence + 1);

    entries.push({
      category: match.category,
      value: match.value.trim(),
      normalizedValue: normalizeValue(match.category, match.value),
      anchorHash,
      label,
      occurrence,
    });
  }

  return {
    entries,
    truncated: matches.length > MAX_ENTRIES,
  };
}

export async function buildContentIntegrityWitness(
  file: File,
  options: { mode?: ContentWitnessMode } = {}
) {
  const mode = options.mode || "public_values";
  const assetHash = await sha256Buffer(await file.arrayBuffer());
  const extraction = await extractLocalDocumentText(file);

  if (!extraction.text.trim()) {
    throw new Error(
      "HPS could not recover enough text to build a content integrity witness."
    );
  }

  const normalizedText = normalizePublicWitnessText(extraction.text);
  const { entries, truncated } = await witnessEntries(normalizedText);

  if (mode === "public_text" && normalizedText.length > MAX_PUBLIC_TEXT_CHARS) {
    throw new Error(
      `Recovered text is too large for public-text witness mode (${normalizedText.length.toLocaleString()} characters). The current limit is ${MAX_PUBLIC_TEXT_CHARS.toLocaleString()}.`
    );
  }

  const witness: ContentIntegrityWitness = {
    version: "hps-content-witness-1",
    mode,
    sourceTextSha256: await sha256Text(normalizedText),
    textSource: extraction.textSource,
    entries,
    truncated,
    publicText: mode === "public_text" ? normalizedText : null,
    publicTextTokenCount:
      mode === "public_text" ? tokenizeDocumentForDiff(normalizedText).length : null,
  };

  return {
    assetHash,
    witness,
    extractedText: normalizedText,
    warnings: extraction.warnings,
  };
}
