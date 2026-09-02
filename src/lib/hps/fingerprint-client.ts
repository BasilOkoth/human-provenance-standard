"use client";

/**
 * HPS compression-resilient asset fingerprinting.
 *
 * Security model:
 * - SHA-256 remains the authoritative exact-file identity.
 * - Canonical text SHA-256 is conservative: Unicode normalization + whitespace
 *   normalization only. Numbers, punctuation, wording and order are preserved.
 * - Perceptual hashes are supporting evidence only; they MUST NOT be treated as
 *   cryptographic proof of equality.
 * - Files are processed in the browser. The verifier sends only fingerprints to
 *   the HPS API, not the uploaded file bytes.
 */

export type HpsAssetModality = "text" | "visual" | "text_visual" | "binary";

export type HpsAssetFingerprintV1 = {
  version: "hps-fingerprint-1";
  exactSha256: string;
  mimeType: string;
  fileName?: string;
  byteLength: number;
  modality: HpsAssetModality;
  canonicalTextSha256?: string | null;
  canonicalTextLength?: number | null;
  textSimHash64?: string | null;
  pageCount?: number | null;
  visualPHashes?: string[];
  visualDHashes?: string[];
  visualPageIndexes?: number[];
  visualCoverage?: number | null;
  width?: number | null;
  height?: number | null;
  warnings?: string[];
};

const VISUAL_MAX_PDF_PAGES = 80;
const PDF_RENDER_MAX_DIMENSION = 420;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Buffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

async function sha256Text(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Intentionally conservative canonicalization.
 * We normalize representation differences but do NOT lowercase, remove numbers,
 * remove punctuation, reorder content, or otherwise make substantive edits vanish.
 */
export function normalizeDocumentText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\u00ad/g, "") // soft hyphen introduced by some PDF pipelines
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

function fnv1a64(value: string) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash;
}

/**
 * 64-bit SimHash used only to identify possible related derivatives.
 * It is NOT a cryptographic hash and never replaces SHA-256.
 */
export function textSimHash64(text: string) {
  const tokens = normalizeDocumentText(text)
    .split(/\s+/u)
    .filter(Boolean);
  if (!tokens.length) return null;

  const weights = new Array<number>(64).fill(0);
  for (const token of tokens) {
    const h = fnv1a64(token);
    for (let bit = 0; bit < 64; bit++) {
      weights[bit] += ((h >> BigInt(bit)) & 1n) === 1n ? 1 : -1;
    }
  }

  let result = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (weights[bit] >= 0) result |= 1n << BigInt(bit);
  }
  return result.toString(16).padStart(16, "0");
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bitsToHex(bits: number[]) {
  let value = 0n;
  bits.forEach((bit, i) => {
    if (bit) value |= 1n << BigInt(bits.length - 1 - i);
  });
  return value.toString(16).padStart(Math.ceil(bits.length / 4), "0");
}

function grayscaleFromCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float64Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    gray[p] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  }
  return gray;
}

function renderSourceToCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function dHash64(source: CanvasImageSource) {
  const canvas = renderSourceToCanvas(source, 9, 8);
  const gray = grayscaleFromCanvas(canvas);
  const bits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

function pHash64(source: CanvasImageSource) {
  const size = 32;
  const canvas = renderSourceToCanvas(source, size, size);
  const gray = grayscaleFromCanvas(canvas);
  const coeffs: number[] = [];

  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0;
      for (let y = 0; y < size; y++) {
        const cy = Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        for (let x = 0; x < size; x++) {
          const cx = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
          sum += gray[y * size + x] * cx * cy;
        }
      }
      coeffs.push(sum);
    }
  }

  const threshold = median(coeffs.slice(1));
  const bits = coeffs.map((value, index) => (index === 0 ? 0 : value > threshold ? 1 : 0));
  return bitsToHex(bits);
}

function visualHashes(source: CanvasImageSource) {
  return { pHash: pHash64(source), dHash: dHash64(source) };
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isDocx(file: File) {
  return file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx");
}

function isTextLike(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    /\.(txt|md|markdown|csv|json|xml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|h|hpp|go|rs|sql|yaml|yml)$/i.test(name);
}

function evenlySampledPageIndexes(pageCount: number, maxPages: number) {
  if (pageCount <= maxPages) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const indexes = new Set<number>();
  for (let i = 0; i < maxPages; i++) {
    indexes.add(1 + Math.round((i * (pageCount - 1)) / (maxPages - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

async function fingerprintPdf(file: File, exactSha256: string, buffer: ArrayBuffer): Promise<HpsAssetFingerprintV1> {
  const warnings: string[] = [];
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await task.promise;
  const pageCount = pdf.numPages;
  const pageTexts: string[] = [];
  const visualPHashes: string[] = [];
  const visualDHashes: string[] = [];
  const visualPageIndexes = evenlySampledPageIndexes(pageCount, VISUAL_MAX_PDF_PAGES);
  const visualSet = new Set(visualPageIndexes);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = (textContent.items as any[])
      .map(item => typeof item?.str === "string" ? item.str : "")
      .filter(Boolean)
      .join(" ");
    pageTexts.push(normalizeDocumentText(text));

    if (visualSet.has(pageNumber)) {
      const baseViewport = page.getViewport({ scale: 1 });
      const maxDim = Math.max(baseViewport.width, baseViewport.height);
      const scale = Math.min(1, PDF_RENDER_MAX_DIMENSION / Math.max(1, maxDim));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D context unavailable.");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      const hashes = visualHashes(canvas);
      visualPHashes.push(hashes.pHash);
      visualDHashes.push(hashes.dHash);
      canvas.width = 1;
      canvas.height = 1;
    }

    page.cleanup();
  }

  await pdf.destroy();

  const canonicalText = normalizeDocumentText(pageTexts.join("\n\f\n"));
  const hasUsefulText = canonicalText.length >= 12;
  if (!hasUsefulText) {
    warnings.push("No reliable PDF text layer was detected. HPS will treat visual similarity as supporting evidence only.");
  }
  if (visualPageIndexes.length < pageCount) {
    warnings.push(`Visual fingerprints cover ${visualPageIndexes.length} of ${pageCount} pages; full text is still fingerprinted.`);
  }

  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "application/pdf",
    fileName: file.name,
    byteLength: file.size,
    modality: hasUsefulText ? "text_visual" : "visual",
    canonicalTextSha256: hasUsefulText ? await sha256Text(canonicalText) : null,
    canonicalTextLength: hasUsefulText ? canonicalText.length : 0,
    textSimHash64: hasUsefulText ? textSimHash64(canonicalText) : null,
    pageCount,
    visualPHashes,
    visualDHashes,
    visualPageIndexes,
    visualCoverage: pageCount ? visualPageIndexes.length / pageCount : 0,
    warnings,
  };
}

async function fingerprintImage(file: File, exactSha256: string): Promise<HpsAssetFingerprintV1> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const hashes = visualHashes(bitmap);
    return {
      version: "hps-fingerprint-1",
      exactSha256,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      byteLength: file.size,
      modality: "visual",
      canonicalTextSha256: null,
      canonicalTextLength: 0,
      textSimHash64: null,
      pageCount: 1,
      visualPHashes: [hashes.pHash],
      visualDHashes: [hashes.dHash],
      visualPageIndexes: [1],
      visualCoverage: 1,
      width: bitmap.width,
      height: bitmap.height,
      warnings: ["Visual fingerprints are perceptual evidence and do not replace the exact SHA-256 identity."],
    };
  } finally {
    bitmap?.close();
  }
}

async function fingerprintDocx(file: File, exactSha256: string, buffer: ArrayBuffer): Promise<HpsAssetFingerprintV1> {
  const mammoth: any = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const canonicalText = normalizeDocumentText(result.value || "");
  const warnings = (result.messages || []).map((m: any) => String(m?.message || m)).slice(0, 10);
  warnings.push("DOCX text is fingerprinted, but layout/images are not yet visually fingerprinted; derivative verification is conservative.");

  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: file.name,
    byteLength: file.size,
    modality: "text",
    canonicalTextSha256: canonicalText ? await sha256Text(canonicalText) : null,
    canonicalTextLength: canonicalText.length,
    textSimHash64: canonicalText ? textSimHash64(canonicalText) : null,
    pageCount: null,
    visualPHashes: [],
    visualDHashes: [],
    visualPageIndexes: [],
    visualCoverage: null,
    warnings,
  };
}

async function fingerprintTextFile(file: File, exactSha256: string, buffer: ArrayBuffer): Promise<HpsAssetFingerprintV1> {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const canonicalText = normalizeDocumentText(raw);
  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "text/plain",
    fileName: file.name,
    byteLength: file.size,
    modality: "text",
    canonicalTextSha256: canonicalText ? await sha256Text(canonicalText) : null,
    canonicalTextLength: canonicalText.length,
    textSimHash64: canonicalText ? textSimHash64(canonicalText) : null,
    pageCount: null,
    visualPHashes: [],
    visualDHashes: [],
    visualPageIndexes: [],
    visualCoverage: null,
    warnings: [],
  };
}

export async function fingerprintFile(file: File): Promise<HpsAssetFingerprintV1> {
  const buffer = await file.arrayBuffer();
  const exactSha256 = await sha256Buffer(buffer);

  if (isPdf(file)) return fingerprintPdf(file, exactSha256, buffer);
  if (file.type.startsWith("image/")) return fingerprintImage(file, exactSha256);
  if (isDocx(file)) return fingerprintDocx(file, exactSha256, buffer);
  if (isTextLike(file)) return fingerprintTextFile(file, exactSha256, buffer);

  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "application/octet-stream",
    fileName: file.name,
    byteLength: file.size,
    modality: "binary",
    canonicalTextSha256: null,
    canonicalTextLength: null,
    textSimHash64: null,
    pageCount: null,
    visualPHashes: [],
    visualDHashes: [],
    visualPageIndexes: [],
    visualCoverage: null,
    warnings: ["This file type currently supports exact SHA-256 verification only."],
  };
}
