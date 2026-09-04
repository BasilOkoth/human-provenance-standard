"use client";

/**
 * HPS resilient document fingerprinting.
 *
 * Trust model:
 * - SHA-256 is always the authoritative exact-file identity.
 * - OCR, canonical text, structural fingerprints and visual/mark signals are
 *   supporting evidence used to detect likely derivatives and cross-format copies.
 * - OCR never turns a scan into a cryptographically identical asset.
 * - Files stay in the browser. HPS receives fingerprints, not file bytes.
 */

export type HpsAssetModality = "text" | "visual" | "text_visual" | "binary";
export type HpsTextSource = "embedded" | "ocr" | "mixed" | "extracted" | "plain" | "none";

export type HpsOcrMetadata = {
  used: boolean;
  engine: "tesseract.js";
  language: string;
  averageConfidence: number | null;
  pagesProcessed: number;
  pageNumbers: number[];
};

export type HpsDocumentStructure = {
  lineCount: number;
  wordCount: number;
  numericTokenCount: number;
  dateLikeCount: number;
  identifierLikeCount: number;
  uppercaseLineCount: number;
};

export type HpsDocumentMarkSignals = {
  detector: "hps-document-marks-1";
  signatureLikelihood: number;
  stampLikelihood: number;
  note: string;
};

export type HpsAssetFingerprintV1 = {
  version: "hps-fingerprint-1";
  exactSha256: string;
  mimeType: string;
  fileName?: string;
  byteLength: number;
  modality: HpsAssetModality;

  // Strict text identity. Conservative normalization only.
  canonicalTextSha256?: string | null;
  canonicalTextLength?: number | null;
  textSimHash64?: string | null;

  // Cross-format comparison layer. Case/spacing/presentation differences are
  // normalized, but wording and numbers remain represented.
  contentCanonicalSha256?: string | null;
  contentSimHash64?: string | null;
  structureSimHash64?: string | null;
  documentStructure?: HpsDocumentStructure | null;
  textSource?: HpsTextSource;
  ocr?: HpsOcrMetadata | null;

  pageCount?: number | null;
  visualPHashes?: string[];
  visualDHashes?: string[];
  visualPageIndexes?: number[];
  visualCoverage?: number | null;
  width?: number | null;
  height?: number | null;
  markSignals?: HpsDocumentMarkSignals | null;
  warnings?: string[];
};

const VISUAL_MAX_PDF_PAGES = 80;
const PDF_VISUAL_MAX_DIMENSION = 420;
const OCR_RENDER_MAX_DIMENSION = 1800;
const OCR_MAX_PDF_PAGES = 16;
const OCR_MIN_USEFUL_TEXT = 12;
const OCR_LANGUAGE = process.env.NEXT_PUBLIC_HPS_OCR_LANGUAGE || "eng";

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

/** Conservative canonicalization used for a strong text identity. */
export function normalizeDocumentText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

/**
 * Cross-format normalization. This deliberately normalizes representation and
 * typography more aggressively than canonicalTextSha256, while retaining words,
 * numbers and punctuation. It is supporting evidence only.
 */
export function normalizeComparableDocumentText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/-\s*\n\s*(?=[\p{L}])/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
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

/** 64-bit SimHash; never a cryptographic identity. */
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

function comparableSimHash64(text: string) {
  const normalized = normalizeComparableDocumentText(text);
  const tokens = normalized.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || [];
  if (!tokens.length) return null;
  return textSimHash64(tokens.join(" "));
}

function tokenShape(token: string) {
  if (/^\p{L}+$/u.test(token)) return `L${Math.min(8, Math.ceil(token.length / 3))}`;
  if (/^\p{N}+$/u.test(token)) return `N${Math.min(8, token.length)}`;
  if (/^[\p{L}\p{N}]+$/u.test(token)) return "M";
  return "P";
}

function buildDocumentStructure(text: string) {
  const normalized = normalizeDocumentText(text);
  const lines = normalized.split("\n").map(x => x.trim()).filter(Boolean);
  const words = normalized.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || [];
  const numericTokens = normalized.match(/\b\d+(?:[.,:/-]\d+)*\b/g) || [];
  const dateLikes = normalized.match(/\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/g) || [];
  const identifierLikes = normalized.match(/\b(?=[A-Z0-9-]{6,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/g) || [];
  const uppercaseLineCount = lines.filter(line => {
    const letters = line.match(/\p{L}/gu) || [];
    if (letters.length < 4) return false;
    const uppers = line.match(/\p{Lu}/gu) || [];
    return uppers.length / letters.length >= 0.8;
  }).length;

  // Build a bag-of-structural-token sequence for SimHash. Keeping shape tokens
  // separate (rather than hashing one giant shape string) makes small formatting
  // changes produce gradual similarity changes instead of an unrelated 64-bit hash.
  const shapeText = lines.map(line => {
    const tokens = line.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) || [];
    return `${tokens.map(tokenShape).join(" ")} LINE_BREAK`;
  }).join(" ");

  const structure: HpsDocumentStructure = {
    lineCount: lines.length,
    wordCount: words.length,
    numericTokenCount: numericTokens.length,
    dateLikeCount: dateLikes.length,
    identifierLikeCount: identifierLikes.length,
    uppercaseLineCount,
  };

  return {
    structure,
    structureSimHash64: shapeText ? textSimHash64(shapeText) : null,
  };
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
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function scaledCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxDimension: number) {
  const maxDim = Math.max(sourceWidth, sourceHeight, 1);
  const scale = Math.min(1, maxDimension / maxDim);
  return renderSourceToCanvas(source, sourceWidth * scale, sourceHeight * scale);
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Conservative visual mark heuristics. They identify ink/color patterns that may
 * correspond to signatures or stamps. They are not biometric/signature proof and
 * never establish authenticity by themselves.
 */
function detectDocumentMarks(source: CanvasImageSource): HpsDocumentMarkSignals {
  const canvas = renderSourceToCanvas(source, 192, 192);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  const data = ctx.getImageData(0, 0, 192, 192).data;

  let bottomDark = 0;
  let bottomColored = 0;
  let bottomPixels = 0;
  let allColored = 0;

  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 192; x++) {
      const i = (y * 192 + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const coloredInk = chroma > 42 && lum < 235;
      if (coloredInk) allColored++;
      if (y >= 104) {
        bottomPixels++;
        if (lum < 150) bottomDark++;
        if (coloredInk) bottomColored++;
      }
    }
  }

  const bottomDarkRatio = bottomPixels ? bottomDark / bottomPixels : 0;
  const bottomColorRatio = bottomPixels ? bottomColored / bottomPixels : 0;
  const colorRatio = allColored / (192 * 192);

  // Deliberately modest scores to avoid presenting heuristic marks as proof.
  const signatureLikelihood = clamp01((bottomDarkRatio - 0.012) / 0.12) * 0.78;
  const stampLikelihood = clamp01(Math.max(bottomColorRatio * 24, colorRatio * 30)) * 0.84;

  return {
    detector: "hps-document-marks-1",
    signatureLikelihood: Number(signatureLikelihood.toFixed(3)),
    stampLikelihood: Number(stampLikelihood.toFixed(3)),
    note: "Heuristic visual signal only; this does not authenticate a signature, seal or stamp.",
  };
}

function mergeMarkSignals(signals: HpsDocumentMarkSignals[]): HpsDocumentMarkSignals | null {
  if (!signals.length) return null;
  return {
    detector: "hps-document-marks-1",
    signatureLikelihood: Math.max(...signals.map(s => s.signatureLikelihood)),
    stampLikelihood: Math.max(...signals.map(s => s.stampLikelihood)),
    note: "Maximum supporting signal across sampled pages; not proof of signature/stamp authenticity.",
  };
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

async function createOcrWorker() {
  const tesseract: any = await import("tesseract.js");
  return tesseract.createWorker(OCR_LANGUAGE);
}

async function recognizeCanvas(worker: any, canvas: HTMLCanvasElement) {
  const result = await worker.recognize(canvas);
  return {
    text: normalizeDocumentText(result?.data?.text || ""),
    confidence: typeof result?.data?.confidence === "number" ? result.data.confidence : null,
  };
}

async function renderPdfPage(page: any, maxDimension: number) {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxDim = Math.max(baseViewport.width, baseViewport.height, 1);
  const scale = Math.min(1.75, maxDimension / maxDim);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas;
}

async function textFingerprintFields(text: string) {
  const strict = normalizeDocumentText(text);
  const comparable = normalizeComparableDocumentText(text);
  const { structure, structureSimHash64 } = buildDocumentStructure(strict);
  return {
    canonicalTextSha256: strict.length >= OCR_MIN_USEFUL_TEXT ? await sha256Text(strict) : null,
    canonicalTextLength: strict.length,
    textSimHash64: strict.length >= OCR_MIN_USEFUL_TEXT ? textSimHash64(strict) : null,
    contentCanonicalSha256: comparable.length >= OCR_MIN_USEFUL_TEXT ? await sha256Text(comparable) : null,
    contentSimHash64: comparable.length >= OCR_MIN_USEFUL_TEXT ? comparableSimHash64(comparable) : null,
    structureSimHash64: strict.length >= OCR_MIN_USEFUL_TEXT ? structureSimHash64 : null,
    documentStructure: strict.length >= OCR_MIN_USEFUL_TEXT ? structure : null,
  };
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
  const markSignals: HpsDocumentMarkSignals[] = [];
  const ocrPageNumbers: number[] = [];
  const ocrConfidences: number[] = [];
  let worker: any = null;
  let embeddedPages = 0;
  let ocrPages = 0;
  let skippedOcrPages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const embedded = normalizeDocumentText(
        (textContent.items as any[])
          .map(item => typeof item?.str === "string" ? item.str : "")
          .filter(Boolean)
          .join(" ")
      );

      const needsOcr = embedded.length < OCR_MIN_USEFUL_TEXT;
      let pageText = embedded;
      let rendered: HTMLCanvasElement | null = null;

      if (embedded.length >= OCR_MIN_USEFUL_TEXT) embeddedPages++;

      if (needsOcr && ocrPages < OCR_MAX_PDF_PAGES) {
        try {
          rendered = await renderPdfPage(page, OCR_RENDER_MAX_DIMENSION);
          worker ||= await createOcrWorker();
          const recognized = await recognizeCanvas(worker, rendered);
          if (recognized.text.length >= OCR_MIN_USEFUL_TEXT) {
            pageText = recognized.text;
            ocrPages++;
            ocrPageNumbers.push(pageNumber);
            if (recognized.confidence !== null) ocrConfidences.push(recognized.confidence);
          }
        } catch (error: any) {
          warnings.push(`OCR could not read PDF page ${pageNumber}: ${String(error?.message || error).slice(0, 220)}`);
        }
      } else if (needsOcr) {
        skippedOcrPages++;
      }

      pageTexts.push(pageText);

      if (visualSet.has(pageNumber)) {
        if (!rendered) rendered = await renderPdfPage(page, PDF_VISUAL_MAX_DIMENSION);
        const hashes = visualHashes(rendered);
        visualPHashes.push(hashes.pHash);
        visualDHashes.push(hashes.dHash);
        markSignals.push(detectDocumentMarks(rendered));
      }

      if (rendered) {
        rendered.width = 1;
        rendered.height = 1;
      }
      page.cleanup();
    }
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
    await pdf.destroy();
  }

  const canonicalText = normalizeDocumentText(pageTexts.join("\n\f\n"));
  const hasUsefulText = canonicalText.length >= OCR_MIN_USEFUL_TEXT;
  const fields = await textFingerprintFields(canonicalText);

  if (!hasUsefulText) {
    warnings.push("No reliable embedded or OCR text was recovered. HPS will use visual similarity only as supporting evidence.");
  }
  if (skippedOcrPages > 0) {
    warnings.push(`OCR is capped at ${OCR_MAX_PDF_PAGES} image-only pages per file; ${skippedOcrPages} page(s) were not OCR-processed.`);
  }
  if (visualPageIndexes.length < pageCount) {
    warnings.push(`Visual fingerprints cover ${visualPageIndexes.length} of ${pageCount} pages; text/OCR coverage may be broader.`);
  }

  const averageConfidence = ocrConfidences.length
    ? ocrConfidences.reduce((a, b) => a + b, 0) / ocrConfidences.length
    : null;

  const textSource: HpsTextSource = ocrPages && embeddedPages ? "mixed" : ocrPages ? "ocr" : embeddedPages ? "embedded" : "none";

  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "application/pdf",
    fileName: file.name,
    byteLength: file.size,
    modality: hasUsefulText ? "text_visual" : "visual",
    ...fields,
    textSource,
    ocr: {
      used: ocrPages > 0,
      engine: "tesseract.js",
      language: OCR_LANGUAGE,
      averageConfidence: averageConfidence === null ? null : Number(averageConfidence.toFixed(1)),
      pagesProcessed: ocrPages,
      pageNumbers: ocrPageNumbers,
    },
    pageCount,
    visualPHashes,
    visualDHashes,
    visualPageIndexes,
    visualCoverage: pageCount ? visualPageIndexes.length / pageCount : 0,
    markSignals: mergeMarkSignals(markSignals),
    warnings,
  };
}

async function fingerprintImage(file: File, exactSha256: string): Promise<HpsAssetFingerprintV1> {
  const warnings: string[] = [
    "Visual and OCR fingerprints are supporting evidence and do not replace exact SHA-256 identity.",
    "Signature/stamp signals are heuristic only and do not authenticate a person, seal or institution.",
  ];
  let bitmap: ImageBitmap | null = null;
  let worker: any = null;

  try {
    bitmap = await createImageBitmap(file);
    const hashes = visualHashes(bitmap);
    const markSignals = detectDocumentMarks(bitmap);
    let ocrText = "";
    let confidence: number | null = null;

    try {
      const canvas = scaledCanvas(bitmap, bitmap.width, bitmap.height, OCR_RENDER_MAX_DIMENSION);
      worker = await createOcrWorker();
      const recognized = await recognizeCanvas(worker, canvas);
      ocrText = recognized.text;
      confidence = recognized.confidence;
      canvas.width = 1;
      canvas.height = 1;
    } catch (error: any) {
      warnings.push(`OCR unavailable for this image: ${String(error?.message || error).slice(0, 220)}`);
    }

    const fields = await textFingerprintFields(ocrText);
    const hasText = ocrText.length >= OCR_MIN_USEFUL_TEXT;

    return {
      version: "hps-fingerprint-1",
      exactSha256,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      byteLength: file.size,
      modality: hasText ? "text_visual" : "visual",
      ...fields,
      textSource: hasText ? "ocr" : "none",
      ocr: {
        used: hasText,
        engine: "tesseract.js",
        language: OCR_LANGUAGE,
        averageConfidence: confidence === null ? null : Number(confidence.toFixed(1)),
        pagesProcessed: hasText ? 1 : 0,
        pageNumbers: hasText ? [1] : [],
      },
      pageCount: 1,
      visualPHashes: [hashes.pHash],
      visualDHashes: [hashes.dHash],
      visualPageIndexes: [1],
      visualCoverage: 1,
      width: bitmap.width,
      height: bitmap.height,
      markSignals,
      warnings,
    };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
    bitmap?.close();
  }
}

async function fingerprintDocx(file: File, exactSha256: string, buffer: ArrayBuffer): Promise<HpsAssetFingerprintV1> {
  const mammoth: any = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const canonicalText = normalizeDocumentText(result.value || "");
  const warnings = (result.messages || []).map((m: any) => String(m?.message || m)).slice(0, 10);
  warnings.push("DOCX text is extracted for cross-format matching. Layout, embedded signatures and stamps are not visually authenticated from DOCX.");
  const fields = await textFingerprintFields(canonicalText);

  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: file.name,
    byteLength: file.size,
    modality: "text",
    ...fields,
    textSource: canonicalText.length >= OCR_MIN_USEFUL_TEXT ? "extracted" : "none",
    ocr: null,
    pageCount: null,
    visualPHashes: [],
    visualDHashes: [],
    visualPageIndexes: [],
    visualCoverage: null,
    markSignals: null,
    warnings,
  };
}

async function fingerprintTextFile(file: File, exactSha256: string, buffer: ArrayBuffer): Promise<HpsAssetFingerprintV1> {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const canonicalText = normalizeDocumentText(raw);
  const fields = await textFingerprintFields(canonicalText);
  return {
    version: "hps-fingerprint-1",
    exactSha256,
    mimeType: file.type || "text/plain",
    fileName: file.name,
    byteLength: file.size,
    modality: "text",
    ...fields,
    textSource: canonicalText.length >= OCR_MIN_USEFUL_TEXT ? "plain" : "none",
    ocr: null,
    pageCount: null,
    visualPHashes: [],
    visualDHashes: [],
    visualPageIndexes: [],
    visualCoverage: null,
    markSignals: null,
    warnings: [],
  };
}

export async function fingerprintFile(file: File): Promise<HpsAssetFingerprintV1> {
  const buffer = await file.arrayBuffer();
  const exactSha256 = await sha256Buffer(buffer);

  if (isPdf(file)) return fingerprintPdf(file, exactSha256, buffer);
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) {
    return fingerprintImage(file, exactSha256);
  }
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
    contentCanonicalSha256: null,
    contentSimHash64: null,
    structureSimHash64: null,
    documentStructure: null,
    textSource: "none",
    ocr: null,
    pageCount: null,
    visualPHashes: [],
    visualDHashes: [],
    visualPageIndexes: [],
    visualCoverage: null,
    markSignals: null,
    warnings: ["This file type currently supports exact SHA-256 verification only."],
  };
}
