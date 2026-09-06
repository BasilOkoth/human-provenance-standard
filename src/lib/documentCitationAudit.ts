export type AuditSource = {
  id: string;
  title: string;
  evidenceNote?: string;
  metadata?: {
    doi?: string;
    doiStatus?: string;
    publishedYear?: number;
    authors?: string[];
  };
};

export type CitationMarker = {
  raw: string;
  kind: "author-year" | "numeric" | "doi";
  author?: string;
  year?: number;
  number?: number;
  doi?: string;
  resolvedSourceIds: string[];
};

export type DocumentClaimAudit = {
  id: string;
  sentence: string;
  index: number;
  claimLike: boolean;
  citationMarkers: CitationMarker[];
  resolvedSourceIds: string[];
  status: "supported" | "weak-support" | "uncited" | "unresolved-citation" | "possible-conflict";
  supportScore: number;
  notes: string[];
};

export type DocumentAuditResult = {
  version: "hps-document-citation-audit/0.1";
  generatedAt: string;
  manuscriptHash?: string;
  sentenceCount: number;
  claimCount: number;
  supportedClaims: number;
  uncitedClaims: number;
  unresolvedCitations: number;
  weakSupportClaims: number;
  conflictCandidates: number;
  claims: DocumentClaimAudit[];
  limitations: string[];
};

const STOP = new Set([
  "the","and","for","with","that","this","from","into","are","was","were","has","have","had","not","but","than","then","its","their","there","which","when","where","what","how","can","may","might","could","would","should","also","using","used","use","our","we","they","these","those","between","within","across","through"
]);

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

function overlap(a: string, b: string) {
  const left = tokens(a); const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let same = 0; left.forEach((t) => { if (right.has(t)) same += 1; });
  return same / Math.min(left.size, right.size);
}

function surname(name: string) {
  const cleaned = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function normalizeDoi(value: string) {
  return value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").replace(/[),.;]+$/, "").toLowerCase();
}

function splitSentences(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“\"'])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function looksLikeReferenceEntry(sentence: string) {
  return /^references\b/i.test(sentence) || /https?:\/\//i.test(sentence) && /\b(doi|vol|journal|publisher|retrieved)\b/i.test(sentence);
}

function isClaimLike(sentence: string) {
  if (sentence.endsWith("?") || looksLikeReferenceEntry(sentence)) return false;
  const words = sentence.split(/\s+/).length;
  if (words < 7) return false;
  const signals = /\b(is|are|was|were|shows?|demonstrates?|indicates?|suggests?|found|finds|increases?|decreases?|improves?|reduces?|causes?|associated|significant|higher|lower|more|less|results?|leads?|supports?|affects?|predicts?|evidence|therefore|thus)\b/i;
  const quantitative = /\b\d+(?:\.\d+)?\s*(?:%|percent|times|fold|kg|km|years?|months?|days?)\b/i;
  return signals.test(sentence) || quantitative.test(sentence) || words >= 16;
}

function parseMarkers(sentence: string, sources: AuditSource[]): CitationMarker[] {
  const markers: CitationMarker[] = [];
  const seen = new Set<string>();

  const doiMatches = sentence.match(/10\.\d{4,9}\/[A-Z0-9._;()/:+-]+/gi) || [];
  doiMatches.forEach((raw) => {
    const doi = normalizeDoi(raw);
    const resolvedSourceIds = sources.filter((s) => normalizeDoi(s.metadata?.doi || "") === doi).map((s) => s.id);
    const key = `doi:${doi}`; if (seen.has(key)) return; seen.add(key);
    markers.push({ raw, kind: "doi", doi, resolvedSourceIds });
  });

  const authorYearRegex = /\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+)(?:\s+et\s+al\.)?\s*,?\s*\(?((?:19|20)\d{2})\)?/g;
  let match: RegExpExecArray | null;
  while ((match = authorYearRegex.exec(sentence))) {
    const author = match[1]; const year = Number(match[2]);
    const resolvedSourceIds = sources.filter((s) => {
      const authorMatch = (s.metadata?.authors || []).some((a) => surname(a) === author.toLowerCase());
      return authorMatch && s.metadata?.publishedYear === year;
    }).map((s) => s.id);
    const key = `ay:${author.toLowerCase()}:${year}`; if (seen.has(key)) continue; seen.add(key);
    markers.push({ raw: match[0], kind: "author-year", author, year, resolvedSourceIds });
  }

  const numericRegex = /\[(\d{1,3})\]/g;
  while ((match = numericRegex.exec(sentence))) {
    const number = Number(match[1]);
    const resolvedSourceIds = number > 0 && number <= sources.length ? [sources[number - 1].id] : [];
    const key = `num:${number}`; if (seen.has(key)) continue; seen.add(key);
    markers.push({ raw: match[0], kind: "numeric", number, resolvedSourceIds });
  }

  return markers;
}

const POSITIVE = ["increase","increases","increased","higher","improve","improves","improved","positive","effective","significant","benefit","supports","associated"];
const NEGATIVE = ["decrease","decreases","decreased","lower","worsen","worsens","negative","ineffective","insignificant","no effect","not associated","refutes"];
function any(text: string, terms: string[]) { const t = text.toLowerCase(); return terms.some((x) => t.includes(x)); }
function oppositePolarity(a: string, b: string) { return (any(a, POSITIVE) && any(b, NEGATIVE)) || (any(a, NEGATIVE) && any(b, POSITIVE)); }

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function auditDocument(text: string, sources: AuditSource[]): Promise<DocumentAuditResult> {
  const sentences = splitSentences(text);
  const claims: DocumentClaimAudit[] = [];

  sentences.forEach((sentence, index) => {
    if (!isClaimLike(sentence)) return;
    const citationMarkers = parseMarkers(sentence, sources);
    const resolvedSourceIds = Array.from(new Set(citationMarkers.flatMap((m) => m.resolvedSourceIds)));
    const linkedSources = sources.filter((s) => resolvedSourceIds.includes(s.id));
    const evidenceScores = linkedSources.map((s) => overlap(sentence, s.evidenceNote || s.title));
    const supportScore = evidenceScores.length ? Math.max(...evidenceScores) : 0;
    const notes: string[] = [];
    let status: DocumentClaimAudit["status"] = "supported";

    if (!citationMarkers.length) {
      status = "uncited";
      notes.push("No recognizable in-text citation marker was found near this claim.");
    } else if (!resolvedSourceIds.length) {
      status = "unresolved-citation";
      notes.push("Citation marker(s) were detected, but none resolved to sources captured in this HPS session.");
    } else {
      const conflict = linkedSources.some((s) => s.evidenceNote && oppositePolarity(sentence, s.evidenceNote) && overlap(sentence, s.evidenceNote) >= 0.18);
      if (conflict) {
        status = "possible-conflict";
        notes.push("At least one linked evidence note uses opposite directional language on an overlapping topic. Human review is required.");
      } else if (supportScore < 0.12) {
        status = "weak-support";
        notes.push("The linked source metadata/evidence note has low lexical overlap with this claim. This is a review signal, not proof of miscitation.");
      } else {
        notes.push("At least one linked source has a resolved citation and non-trivial overlap with the claim/evidence note.");
      }
    }

    if (/\b(all|always|never|proves?|causes?)\b/i.test(sentence) && resolvedSourceIds.length < 2) {
      notes.push("Strong or universal wording is supported by fewer than two captured sources; consider whether the wording is proportionate to the evidence.");
    }
    if (/[“\"][^”\"]{12,}[”\"]/.test(sentence) && !citationMarkers.length) {
      notes.push("A direct quotation-like passage appears without a recognized citation marker.");
    }

    claims.push({ id: `docclaim_${index}`, sentence, index, claimLike: true, citationMarkers, resolvedSourceIds, status, supportScore, notes });
  });

  return {
    version: "hps-document-citation-audit/0.1",
    generatedAt: new Date().toISOString(),
    manuscriptHash: await sha256(text),
    sentenceCount: sentences.length,
    claimCount: claims.length,
    supportedClaims: claims.filter((c) => c.status === "supported").length,
    uncitedClaims: claims.filter((c) => c.status === "uncited").length,
    unresolvedCitations: claims.filter((c) => c.status === "unresolved-citation").length,
    weakSupportClaims: claims.filter((c) => c.status === "weak-support").length,
    conflictCandidates: claims.filter((c) => c.status === "possible-conflict").length,
    claims,
    limitations: [
      "This prototype uses transparent deterministic rules; it does not determine whether a claim is true or false.",
      "Author-year and numeric citation resolution depends on sources already captured in the HPS session.",
      "Lexical evidence overlap is a triage signal and cannot establish scientific entailment.",
      "Possible conflicts always require human review before any provenance record is signed.",
    ],
  };
}
