"use client";

import { normalizeDocumentText, type HpsTextSource } from "./fingerprint-client";

export type HpsLocalTextExtraction = {
  text: string;
  textSource: HpsTextSource;
  ocrUsed: boolean;
  ocrAverageConfidence: number | null;
  warnings: string[];
};

const OCR_RENDER_MAX_DIMENSION = 1800;
const OCR_MAX_PDF_PAGES = 16;
const OCR_MIN_USEFUL_TEXT = 12;
const OCR_LANGUAGE = process.env.NEXT_PUBLIC_HPS_OCR_LANGUAGE || "eng";

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

async function createOcrWorker() {
  const tesseract: any = await import("tesseract.js");
  return tesseract.createWorker(OCR_LANGUAGE);
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

async function recognizeCanvas(worker: any, canvas: HTMLCanvasElement) {
  const result = await worker.recognize(canvas);
  return {
    text: normalizeDocumentText(result?.data?.text || ""),
    confidence: typeof result?.data?.confidence === "number" ? result.data.confidence : null,
  };
}

async function extractPdf(file: File): Promise<HpsLocalTextExtraction> {
  const warnings: string[] = [];
  const buffer = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await task.promise;
  const pageTexts: string[] = [];
  const confidences: number[] = [];
  let embeddedPages = 0;
  let ocrPages = 0;
  let skippedOcrPages = 0;
  let worker: any = null;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const embedded = normalizeDocumentText(
        (textContent.items as any[])
          .map(item => typeof item?.str === "string" ? item.str : "")
          .filter(Boolean)
          .join(" ")
      );

      let pageText = embedded;
      if (embedded.length >= OCR_MIN_USEFUL_TEXT) embeddedPages++;

      if (embedded.length < OCR_MIN_USEFUL_TEXT && ocrPages < OCR_MAX_PDF_PAGES) {
        let canvas: HTMLCanvasElement | null = null;
        try {
          canvas = await renderPdfPage(page, OCR_RENDER_MAX_DIMENSION);
          worker ||= await createOcrWorker();
          const recognized = await recognizeCanvas(worker, canvas);
          if (recognized.text.length >= OCR_MIN_USEFUL_TEXT) {
            pageText = recognized.text;
            ocrPages++;
            if (recognized.confidence !== null) confidences.push(recognized.confidence);
          }
        } catch (error: any) {
          warnings.push(`OCR could not read PDF page ${pageNumber}: ${String(error?.message || error).slice(0, 220)}`);
        } finally {
          if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
          }
        }
      } else if (embedded.length < OCR_MIN_USEFUL_TEXT) {
        skippedOcrPages++;
      }

      pageTexts.push(pageText);
      page.cleanup();
    }
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
    await pdf.destroy();
  }

  if (skippedOcrPages > 0) {
    warnings.push(`Exact local text analysis OCR is capped at ${OCR_MAX_PDF_PAGES} image-only pages; ${skippedOcrPages} page(s) were not OCR-processed.`);
  }

  const text = normalizeDocumentText(pageTexts.join("\n\f\n"));
  const textSource: HpsTextSource = ocrPages && embeddedPages
    ? "mixed"
    : ocrPages
      ? "ocr"
      : embeddedPages
        ? "embedded"
        : "none";

  return {
    text,
    textSource,
    ocrUsed: ocrPages > 0,
    ocrAverageConfidence: confidences.length
      ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1))
      : null,
    warnings,
  };
}

async function extractImage(file: File): Promise<HpsLocalTextExtraction> {
  const warnings: string[] = [];
  let bitmap: ImageBitmap | null = null;
  let worker: any = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    bitmap = await createImageBitmap(file);
    const maxDim = Math.max(bitmap.width, bitmap.height, 1);
    const scale = Math.min(1, OCR_RENDER_MAX_DIMENSION / maxDim);
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    worker = await createOcrWorker();
    const recognized = await recognizeCanvas(worker, canvas);
    return {
      text: recognized.text,
      textSource: recognized.text.length >= OCR_MIN_USEFUL_TEXT ? "ocr" : "none",
      ocrUsed: recognized.text.length >= OCR_MIN_USEFUL_TEXT,
      ocrAverageConfidence: recognized.confidence === null ? null : Number(recognized.confidence.toFixed(1)),
      warnings,
    };
  } catch (error: any) {
    warnings.push(`OCR unavailable for this image: ${String(error?.message || error).slice(0, 220)}`);
    return {
      text: "",
      textSource: "none",
      ocrUsed: false,
      ocrAverageConfidence: null,
      warnings,
    };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    bitmap?.close();
  }
}

async function extractDocx(file: File): Promise<HpsLocalTextExtraction> {
  const mammoth: any = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = normalizeDocumentText(result.value || "");
  return {
    text,
    textSource: text.length >= OCR_MIN_USEFUL_TEXT ? "extracted" : "none",
    ocrUsed: false,
    ocrAverageConfidence: null,
    warnings: (result.messages || []).map((message: any) => String(message?.message || message)).slice(0, 10),
  };
}

async function extractText(file: File): Promise<HpsLocalTextExtraction> {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
  const text = normalizeDocumentText(raw);
  return {
    text,
    textSource: text.length >= OCR_MIN_USEFUL_TEXT ? "plain" : "none",
    ocrUsed: false,
    ocrAverageConfidence: null,
    warnings: [],
  };
}

export async function extractLocalDocumentText(file: File): Promise<HpsLocalTextExtraction> {
  if (isPdf(file)) return extractPdf(file);
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) return extractImage(file);
  if (isDocx(file)) return extractDocx(file);
  if (isTextLike(file)) return extractText(file);

  return {
    text: "",
    textSource: "none",
    ocrUsed: false,
    ocrAverageConfidence: null,
    warnings: ["This file type does not currently support local text-difference analysis."],
  };
}
