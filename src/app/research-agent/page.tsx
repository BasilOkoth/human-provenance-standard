"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import DocumentCitationInspector from "@/components/DocumentCitationInspector";
import type { DocumentAuditResult } from "@/lib/documentCitationAudit";

type EventType = "source" | "claim" | "ai" | "review" | "checkpoint" | "document-audit" | "document-import";
type DoiStatus = "not-provided" | "pending" | "verified" | "not-found" | "error";
type SourceOrigin = "publisher-record" | "repository" | "aggregator" | "unknown";

type SourceMetadata = {
  doi?: string;
  doiStatus: DoiStatus;
  crossrefType?: string;
  publisher?: string;
  publishedYear?: number;
  authors?: string[];
  canonicalUrl?: string;
  origin: SourceOrigin;
  originReason?: string;
};

type ResearchEvent = {
  id: string;
  type: EventType;
  at: string;
  title: string;
  detail?: string;
  url?: string;
  evidenceNote?: string;
  citations?: string[];
  metadata?: SourceMetadata;
  reviewed?: boolean;
  documentAudit?: DocumentAuditResult;
};

type Session = {
  version: "hps-research-session/0.4";
  id: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  events: ResearchEvent[];
};

type Finding = {
  id: string;
  severity: "info" | "warning" | "high";
  category: "citation" | "doi" | "source-origin" | "contradiction" | "ai-review" | "checkpoint" | "integrity";
  message: string;
};

const STORAGE_KEY = "hps.trustedResearchAgent.session.v4";
const WORD_IMPORT_KEY = "hps.trustedResearchAgent.wordImport.v1";

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function sha256Text(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDoi(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function looksLikeDoi(value: string) {
  return /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(normalizeDoi(value));
}

function detectSourceOrigin(urlValue: string, canonicalUrl?: string): Pick<SourceMetadata, "origin" | "originReason"> {
  const raw = canonicalUrl || urlValue;
  if (!raw) return { origin: "unknown", originReason: "No resolvable URL is available." };

  try {
    const host = new URL(raw).hostname.toLowerCase();
    const aggregators = ["researchgate.net", "semanticscholar.org", "scholar.google", "academia.edu", "sciencedirect.com/topics"];
    const repositories = ["arxiv.org", "zenodo.org", "figshare.com", "osf.io", "pubmed.ncbi.nlm.nih.gov", "europepmc.org"];

    if (aggregators.some((domain) => host.includes(domain))) {
      return { origin: "aggregator", originReason: `The URL is served through ${host}; verify against the DOI/publisher record.` };
    }
    if (repositories.some((domain) => host.includes(domain))) {
      return { origin: "repository", originReason: `The URL is hosted by ${host}; this may be a repository copy rather than the publisher record.` };
    }
    if (host === "doi.org" || host.endsWith(".doi.org")) {
      return { origin: "publisher-record", originReason: "The DOI resolver points to the canonical scholarly record." };
    }
    if (canonicalUrl) {
      return { origin: "publisher-record", originReason: `Crossref metadata identifies ${host} as the canonical record URL.` };
    }
    return { origin: "unknown", originReason: "No DOI metadata is available to establish whether this is the original publisher record." };
  } catch {
    return { origin: "unknown", originReason: "The source URL could not be parsed for origin checks." };
  }
}

function tokenize(value: string) {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "were", "has", "have", "had", "not", "but", "than", "then", "its", "their", "there", "which", "when", "where", "what", "how"]);
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stop.has(word))
  );
}

function overlapScore(a: string, b: string) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((token) => { if (right.has(token)) common += 1; });
  return common / Math.min(left.size, right.size);
}

const polarityPairs: Array<[string[], string[]]> = [
  [["increase", "increases", "increased", "higher", "rise", "rises", "positive", "improve", "improves", "benefit", "supports"], ["decrease", "decreases", "decreased", "lower", "decline", "declines", "negative", "worsen", "worsens", "harm", "refutes"]],
  [["effective", "significant", "associated", "causes"], ["ineffective", "insignificant", "unrelated", "does not cause", "no effect"]],
];

function containsAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function contradictionCandidate(a: string, b: string) {
  if (overlapScore(a, b) < 0.3) return false;
  return polarityPairs.some(([positive, negative]) =>
    (containsAny(a, positive) && containsAny(b, negative)) ||
    (containsAny(a, negative) && containsAny(b, positive))
  );
}

function citationLabel(source: ResearchEvent) {
  const meta = source.metadata;
  if (!meta) return source.title;
  const author = meta.authors?.[0] || source.title;
  const year = meta.publishedYear ? ` (${meta.publishedYear})` : "";
  return `${author}${year}${meta.doi ? ` · ${meta.doi}` : ""}`;
}

function eventIcon(type: EventType) {
  if (type === "source") return "S";
  if (type === "claim") return "C";
  if (type === "ai") return "AI";
  if (type === "review") return "✓";
  if (type === "checkpoint") return "◇";
  if (type === "document-audit") return "A";
  return "W";
}

export default function ResearchAgentPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceDoi, setSourceDoi] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState("");
  const [claim, setClaim] = useState("");
  const [claimSources, setClaimSources] = useState<string[]>([]);
  const [aiTask, setAiTask] = useState("");
  const [aiTool, setAiTool] = useState("ChatGPT");
  const [notice, setNotice] = useState("");
  const [checkingDoi, setCheckingDoi] = useState(false);
  const [wordManuscript, setWordManuscript] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("wordImport") === "1") {
      const imported = window.localStorage.getItem(WORD_IMPORT_KEY);
      if (imported) {
        try {
          const payload = JSON.parse(imported) as {
            title?: string;
            text?: string;
            documentUrl?: string;
            capturedAt?: string;
            manuscriptHash?: string;
            scope?: string;
          };

          if (payload.text?.trim()) {
            const at = nowIso();
            const importedSession: Session = {
              version: "hps-research-session/0.4",
              id: uid("session"),
              title: payload.title || "Microsoft Word research session",
              startedAt: at,
              updatedAt: at,
              events: [{
                id: uid("wordimport"),
                type: "document-import",
                at: payload.capturedAt || at,
                title: `Microsoft Word ${payload.scope === "selection" ? "selection" : "document"} imported`,
                detail: `Manuscript content was explicitly transferred from the HPS Word add-in for document-aware provenance review.${payload.manuscriptHash ? ` Word-side SHA-256: ${payload.manuscriptHash}.` : ""}`,
                url: payload.documentUrl || undefined,
              }],
            };
            setSession(importedSession);
            setWordManuscript(payload.text);
            setNotice("Microsoft Word manuscript imported. Run the document-aware audit, review the warnings, then create a provenance checkpoint.");
            window.localStorage.removeItem(WORD_IMPORT_KEY);
            return;
          }
        } catch {
          window.localStorage.removeItem(WORD_IMPORT_KEY);
        }
      }
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      setSession(JSON.parse(raw));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  const sources = useMemo(() => session?.events.filter((event) => event.type === "source") || [], [session]);
  const claims = useMemo(() => session?.events.filter((event) => event.type === "claim") || [], [session]);
  const aiEvents = useMemo(() => session?.events.filter((event) => event.type === "ai") || [], [session]);
  const reviews = useMemo(() => session?.events.filter((event) => event.type === "review") || [], [session]);
  const checkpoints = useMemo(() => session?.events.filter((event) => event.type === "checkpoint") || [], [session]);

  const findings = useMemo<Finding[]>(() => {
    if (!session) return [];
    const events = session.events;
    const sourceEvents = events.filter((event) => event.type === "source");
    const claimEvents = events.filter((event) => event.type === "claim");
    const sessionAiEvents = events.filter((event) => event.type === "ai");
    const sessionReviews = events.filter((event) => event.type === "review");
    const items: Finding[] = [];

    claimEvents.forEach((claimEvent) => {
      const linked = claimEvent.citations || [];
      if (!linked.length) {
        items.push({
          id: `uncited-${claimEvent.id}`,
          severity: "high",
          category: "citation",
          message: `Unlinked claim: “${claimEvent.detail?.slice(0, 120) || claimEvent.title}”. Link at least one supporting source.`,
        });
        return;
      }

      const linkedSources = sourceEvents.filter((source) => linked.includes(source.id));
      if (!linkedSources.length) {
        items.push({
          id: `missing-source-${claimEvent.id}`,
          severity: "high",
          category: "citation",
          message: "A claim points to source IDs that are no longer present in the research trail.",
        });
      }

      if (linkedSources.length && linkedSources.every((source) => source.metadata?.origin === "aggregator" || source.metadata?.origin === "repository")) {
        items.push({
          id: `secondary-origin-${claimEvent.id}`,
          severity: "warning",
          category: "source-origin",
          message: `Claim “${claimEvent.detail?.slice(0, 95)}…” is supported only by repository/aggregator copies. Check the canonical publisher or original record.`,
        });
      }

      if (linkedSources.some((source) => source.metadata?.doi && source.metadata?.doiStatus !== "verified")) {
        items.push({
          id: `doi-support-${claimEvent.id}`,
          severity: "warning",
          category: "doi",
          message: `At least one DOI linked to “${claimEvent.detail?.slice(0, 95)}…” has not been verified against Crossref.`,
        });
      }
    });

    sourceEvents.forEach((source) => {
      const metadata = source.metadata;
      if (metadata?.doi && metadata.doiStatus === "not-found") {
        items.push({
          id: `doi-not-found-${source.id}`,
          severity: "high",
          category: "doi",
          message: `DOI ${metadata.doi} was not found in Crossref. Check for a typo or verify it manually.`,
        });
      }

      if (metadata?.origin === "aggregator") {
        items.push({
          id: `origin-${source.id}`,
          severity: "warning",
          category: "source-origin",
          message: `“${source.title}” appears to be an aggregator copy. Prefer or verify the canonical DOI/publisher record.`,
        });
      }

      if (!source.evidenceNote?.trim()) {
        items.push({
          id: `evidence-note-${source.id}`,
          severity: "info",
          category: "citation",
          message: `“${source.title}” has no evidence note. Record what the source actually supports so citation checks are more meaningful.`,
        });
      }
    });

    for (let i = 0; i < sourceEvents.length; i += 1) {
      for (let j = i + 1; j < sourceEvents.length; j += 1) {
        const left = sourceEvents[i];
        const right = sourceEvents[j];
        if (left.evidenceNote && right.evidenceNote && contradictionCandidate(left.evidenceNote, right.evidenceNote)) {
          items.push({
            id: `contradiction-${left.id}-${right.id}`,
            severity: "warning",
            category: "contradiction",
            message: `Possible contradiction: “${left.title}” and “${right.title}” contain overlapping evidence notes with opposite directional language. Human review is required; HPS does not determine which source is correct.`,
          });
        }
      }
    }

    if (sessionAiEvents.length > sessionReviews.length) {
      items.push({
        id: "ai-review-gap",
        severity: "high",
        category: "ai-review",
        message: "At least one AI-assistance event has not yet been followed by a human-review checkpoint.",
      });
    }

    if (events.length > 0 && !events.some((event) => event.type === "checkpoint")) {
      items.push({
        id: "checkpoint-gap",
        severity: "warning",
        category: "checkpoint",
        message: "No provenance checkpoint has been created for this session yet.",
      });
    }

    if (!items.length && events.length > 0) {
      items.push({
        id: "clear",
        severity: "info",
        category: "integrity",
        message: "No obvious research-integrity or provenance gaps detected by the current transparent rules.",
      });
    }

    return items;
  }, [session]);

  function mutate(add: ResearchEvent) {
    setSession((current) => current
      ? { ...current, updatedAt: nowIso(), events: [...current.events, add] }
      : current
    );
  }

  function replaceEvent(id: string, updater: (event: ResearchEvent) => ResearchEvent) {
    setSession((current) => current ? {
      ...current,
      updatedAt: nowIso(),
      events: current.events.map((event) => event.id === id ? updater(event) : event),
    } : current);
  }

  function startSession() {
    const clean = title.trim() || "Untitled research session";
    const at = nowIso();
    setSession({
      version: "hps-research-session/0.4",
      id: uid("session"),
      title: clean,
      startedAt: at,
      updatedAt: at,
      events: [],
    });
    setNotice("Research session started. Only events you explicitly add are recorded.");
  }

  async function verifyDoi(doiInput: string) {
    const doi = normalizeDoi(doiInput);
    if (!looksLikeDoi(doi)) throw new Error("The DOI format is invalid.");

    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);

    if (response.status === 404) return { doi, status: "not-found" as const };
    if (!response.ok) throw new Error(`Crossref returned ${response.status}.`);

    const data = await response.json();
    const message = data?.message || {};

    const authors = Array.isArray(message.author)
      ? message.author
          .map((author: { given?: string; family?: string }) =>
            [author.given, author.family].filter(Boolean).join(" ")
          )
          .filter(Boolean)
      : [];

    const dateParts =
      message.published?.["date-parts"]?.[0] ||
      message.issued?.["date-parts"]?.[0] ||
      [];

    const canonicalUrl =
      typeof message.URL === "string"
        ? message.URL
        : `https://doi.org/${doi}`;

    return {
      doi,
      status: "verified" as const,
      title: Array.isArray(message.title) ? message.title[0] : undefined,
      crossrefType: message.type,
      publisher: message.publisher,
      publishedYear: Number(dateParts[0]) || undefined,
      authors,
      canonicalUrl,
    };
  }

  async function addSource() {
    if (!session || (!sourceUrl.trim() && !sourceDoi.trim())) return;

    const id = uid("source");
    const normalizedDoi = sourceDoi.trim() ? normalizeDoi(sourceDoi) : undefined;
    const initialOrigin = detectSourceOrigin(sourceUrl.trim());

    mutate({
      id,
      type: "source",
      at: nowIso(),
      title: sourceTitle.trim() || normalizedDoi || sourceUrl.trim(),
      detail: "Research source captured by the researcher.",
      url: sourceUrl.trim() || (normalizedDoi ? `https://doi.org/${normalizedDoi}` : undefined),
      evidenceNote: sourceEvidence.trim() || undefined,
      metadata: {
        doi: normalizedDoi,
        doiStatus: normalizedDoi ? "pending" : "not-provided",
        origin: initialOrigin.origin,
        originReason: initialOrigin.originReason,
      },
    });

    if (normalizedDoi) {
      setCheckingDoi(true);

      try {
        const result = await verifyDoi(normalizedDoi);

        if (result.status === "not-found") {
          replaceEvent(id, (event) => ({
            ...event,
            metadata: { ...event.metadata!, doiStatus: "not-found" },
          }));
          setNotice(`Source added, but DOI ${normalizedDoi} was not found in Crossref.`);
        } else {
          const origin = detectSourceOrigin(sourceUrl.trim(), result.canonicalUrl);

          replaceEvent(id, (event) => ({
            ...event,
            title: sourceTitle.trim() || result.title || event.title,
            url: event.url || result.canonicalUrl,
            metadata: {
              doi: result.doi,
              doiStatus: "verified",
              crossrefType: result.crossrefType,
              publisher: result.publisher,
              publishedYear: result.publishedYear,
              authors: result.authors,
              canonicalUrl: result.canonicalUrl,
              origin: origin.origin,
              originReason: origin.originReason,
            },
          }));

          setNotice(`DOI ${normalizedDoi} verified against Crossref.`);
        }
      } catch (error) {
        replaceEvent(id, (event) => ({
          ...event,
          metadata: { ...event.metadata!, doiStatus: "error" },
        }));

        setNotice(
          error instanceof Error
            ? `Source saved; DOI verification could not complete: ${error.message}`
            : "Source saved; DOI verification could not complete."
        );
      } finally {
        setCheckingDoi(false);
      }
    }

    setSourceUrl("");
    setSourceTitle("");
    setSourceDoi("");
    setSourceEvidence("");
  }

  async function recheckDoi(source: ResearchEvent) {
    const doi = source.metadata?.doi;
    if (!doi) return;

    setCheckingDoi(true);

    try {
      const result = await verifyDoi(doi);

      if (result.status === "not-found") {
        replaceEvent(source.id, (event) => ({
          ...event,
          metadata: { ...event.metadata!, doiStatus: "not-found" },
        }));
        setNotice(`DOI ${doi} was not found in Crossref.`);
      } else {
        const origin = detectSourceOrigin(source.url || "", result.canonicalUrl);

        replaceEvent(source.id, (event) => ({
          ...event,
          title: result.title || event.title,
          metadata: {
            ...event.metadata!,
            doiStatus: "verified",
            crossrefType: result.crossrefType,
            publisher: result.publisher,
            publishedYear: result.publishedYear,
            authors: result.authors,
            canonicalUrl: result.canonicalUrl,
            origin: origin.origin,
            originReason: origin.originReason,
          },
        }));

        setNotice(`DOI ${doi} verified.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "DOI verification failed.");
    } finally {
      setCheckingDoi(false);
    }
  }

  function addClaim() {
    if (!session || !claim.trim()) return;

    mutate({
      id: uid("claim"),
      type: "claim",
      at: nowIso(),
      title: "Research claim",
      detail: claim.trim(),
      citations: [...claimSources],
    });

    setClaim("");
    setClaimSources([]);
  }

  function toggleClaimSource(sourceId: string) {
    setClaimSources((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId]
    );
  }

  function addAiEvent() {
    if (!session || !aiTask.trim()) return;

    mutate({
      id: uid("ai"),
      type: "ai",
      at: nowIso(),
      title: `${aiTool.trim() || "AI tool"} assistance`,
      detail: aiTask.trim(),
      reviewed: false,
    });

    setAiTask("");
  }

  function addReview() {
    if (!session) return;

    mutate({
      id: uid("review"),
      type: "review",
      at: nowIso(),
      title: "Human review",
      detail: "Researcher reviewed the current research state, including agent warnings, and accepts responsibility for the retained content.",
      reviewed: true,
    });
  }

  function addCheckpoint() {
    if (!session) return;

    mutate({
      id: uid("checkpoint"),
      type: "checkpoint",
      at: nowIso(),
      title: `Provenance checkpoint #${session.events.filter((event) => event.type === "checkpoint").length + 1}`,
      detail: "Snapshot marker created before HPS signing or institutional review.",
    });
  }

  function recordDocumentAudit(audit: DocumentAuditResult) {
    if (!session) return;

    mutate({
      id: uid("docaudit"),
      type: "document-audit",
      at: nowIso(),
      title: "Document-aware citation audit",
      detail: `Audited ${audit.claimCount} claim-like sentences: ${audit.supportedClaims} supported, ${audit.uncitedClaims} uncited, ${audit.unresolvedCitations} unresolved citations, ${audit.weakSupportClaims} weak-support flags and ${audit.conflictCandidates} conflict candidates. Manuscript hash: ${audit.manuscriptHash}.`,
      documentAudit: audit,
      reviewed: false,
    });

    setNotice("Document-aware citation audit recorded in the provenance trail.");
  }

  function acceptDocumentClaims(
    claimRows: Array<{ sentence: string; sourceIds: string[]; status: string; supportScore: number }>,
    audit: DocumentAuditResult
  ) {
    if (!session || !claimRows.length) return;

    const at = nowIso();

    setSession((current) => current ? {
      ...current,
      updatedAt: at,
      events: [
        ...current.events,
        ...claimRows.map((row) => ({
          id: uid("docclaim"),
          type: "claim" as const,
          at,
          title: "Document claim accepted after audit",
          detail: row.sentence,
          citations: row.sourceIds,
          reviewed: true,
          evidenceNote: `Document audit status: ${row.status}; support signal: ${Math.round(row.supportScore * 100)}%; manuscript SHA-256: ${audit.manuscriptHash}.`,
        })),
      ],
    } : current);

    setNotice(
      `${claimRows.length} audited manuscript claim${claimRows.length === 1 ? "" : "s"} added to the HPS provenance trail.`
    );
  }

  async function exportManifest() {
    if (!session) return;

    const canonical = JSON.stringify(session);
    const hash = await sha256Text(canonical);

    const manifest = {
      hpsType: "trusted-research-trail",
      hpsVersion: "0.4",
      session,
      integrity: {
        algorithm: "SHA-256",
        canonicalSessionHash: hash,
      },
      agentAssessment: {
        method: "transparent-rule-based-prototype",
        generatedAt: nowIso(),
        findings,
        limitation: "Warnings are decision-support signals, not determinations of truth, misconduct, originality, or research quality.",
      },
      disclosure: {
        captureMode: "explicit-user-approved-events",
        hiddenBrowsingCaptured: false,
        keystrokesCaptured: false,
      },
    };

    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hps-research-trail-${session.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    setNotice(`Exported research trail with SHA-256 integrity hash ${hash.slice(0, 16)}…`);
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setNotice("Local research session cleared.");
  }

  const highFindings = findings.filter((item) => item.severity === "high").length;
  const warningFindings = findings.filter((item) => item.severity === "warning").length;
  const integrityState =
    highFindings > 0
      ? "Review required"
      : warningFindings > 0
        ? "Attention"
        : session?.events.length
          ? "Ready for review"
          : "New session";

  return (
    <main className="raRoot">
      <section className="shell raShell">
        <Nav />

        <div className="raWrap">
          <header className="raHero">
            <div>
              <div className="raEyebrow">
                <span className="raMark">H</span>
                HPS TRUSTED RESEARCH AGENT
              </div>

              <h1>Build the evidence trail as the research happens.</h1>

              <p>
                Connect sources to claims, disclose AI assistance, resolve integrity warnings,
                record human judgement, and create a provenance trail that can later be signed.
              </p>
            </div>

            <div className="raHeroTrust">
              <span>Explicit capture only</span>
              <span>No hidden browsing</span>
              <span>No keystroke logging</span>
            </div>
          </header>

          {!session ? (
            <section className="raStartCard">
              <div className="raStartBadge">01</div>

              <div className="raStartContent">
                <p className="raKicker">START A RESEARCH SESSION</p>
                <h2>Give this research trail a name.</h2>
                <p className="raMuted">
                  HPS will keep the sources, claims, AI disclosures, reviews and checkpoints together
                  as one local research session.
                </p>

                <label className="raField">
                  <span>Research title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Human provenance in agentic research"
                  />
                </label>

                <button className="raButton raPrimary" type="button" onClick={startSession}>
                  Start research session
                  <span>→</span>
                </button>
              </div>
            </section>
          ) : (
            <>
              <section className="raSessionBar">
                <div className="raSessionMain">
                  <div className="raStatusOrb" />
                  <div>
                    <p className="raKicker">ACTIVE RESEARCH SESSION</p>
                    <h2>{session.title}</h2>
                    <p className="raSessionId">{session.id}</p>
                  </div>
                </div>

                <div className="raSessionStatus">
                  <span className={`raState ${highFindings ? "danger" : warningFindings ? "warn" : "ok"}`}>
                    {integrityState}
                  </span>
                  <span className="raUpdated">
                    Updated {new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </section>

              <section className="raMetrics">
                <div><strong>{sources.length}</strong><span>Sources</span></div>
                <div><strong>{claims.length}</strong><span>Claims</span></div>
                <div><strong>{claims.filter((event) => event.citations?.length).length}</strong><span>Cited</span></div>
                <div><strong>{aiEvents.length}</strong><span>AI events</span></div>
                <div><strong>{reviews.length}</strong><span>Human reviews</span></div>
                <div><strong>{checkpoints.length}</strong><span>Checkpoints</span></div>
              </section>

              <div className="raWorkspace">
                <section className="raPanel raSourcePanel">
                  <div className="raPanelHead">
                    <div className="raStep">01</div>
                    <div>
                      <p className="raKicker">SOURCE + DOI</p>
                      <h3>Capture evidence</h3>
                    </div>
                  </div>

                  <p className="raPanelIntro">
                    Add the source you actually consulted and record what it supports.
                    DOI metadata is checked against Crossref when provided.
                  </p>

                  <label className="raField">
                    <span>Source title <em>optional</em></span>
                    <input
                      value={sourceTitle}
                      onChange={(event) => setSourceTitle(event.target.value)}
                      placeholder="Article, report or dataset title"
                    />
                  </label>

                  <label className="raField">
                    <span>Publisher or repository URL</span>
                    <input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="raField">
                    <span>DOI <em>optional</em></span>
                    <input
                      value={sourceDoi}
                      onChange={(event) => setSourceDoi(event.target.value)}
                      placeholder="10.1038/..."
                    />
                  </label>

                  <label className="raField">
                    <span>Evidence note</span>
                    <textarea
                      value={sourceEvidence}
                      onChange={(event) => setSourceEvidence(event.target.value)}
                      placeholder="What does this source actually support?"
                      rows={5}
                    />
                  </label>

                  <button
                    className="raButton raPrimary"
                    onClick={addSource}
                    disabled={checkingDoi}
                  >
                    {checkingDoi ? "Checking DOI…" : "Add + verify source"}
                    {!checkingDoi && <span>→</span>}
                  </button>
                </section>

                <section className="raPanel raClaimPanel">
                  <div className="raPanelHead">
                    <div className="raStep">02</div>
                    <div>
                      <p className="raKicker">CLAIM → CITATION</p>
                      <h3>Connect claims to evidence</h3>
                    </div>
                  </div>

                  <p className="raPanelIntro">
                    State the substantive claim, then select the captured sources that support it.
                  </p>

                  <label className="raField">
                    <span>Research claim</span>
                    <textarea
                      value={claim}
                      onChange={(event) => setClaim(event.target.value)}
                      placeholder="Write the claim as it would appear in the manuscript…"
                      rows={6}
                    />
                  </label>

                  <div className="raEvidencePicker">
                    <div className="raPickerLabel">
                      <span>Supporting evidence</span>
                      <small>{claimSources.length} selected</small>
                    </div>

                    {sources.length ? (
                      <div className="raSourceChoices">
                        {sources.map((source) => (
                          <label
                            key={source.id}
                            className={`raChoice ${claimSources.includes(source.id) ? "selected" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={claimSources.includes(source.id)}
                              onChange={() => toggleClaimSource(source.id)}
                            />
                            <span className="raChoiceMark">✓</span>
                            <span>{citationLabel(source)}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="raEmpty">
                        Add a source first. Captured evidence will appear here.
                      </div>
                    )}
                  </div>

                  <button
                    className="raButton raPrimary"
                    onClick={addClaim}
                    disabled={!claim.trim()}
                  >
                    Add claim with citations
                    <span>→</span>
                  </button>
                </section>

                <section className="raPanel raAiPanel">
                  <div className="raPanelHead">
                    <div className="raStep">03</div>
                    <div>
                      <p className="raKicker">AI DISCLOSURE</p>
                      <h3>Declare machine assistance</h3>
                    </div>
                  </div>

                  <p className="raPanelIntro">
                    Record the task the AI performed. HPS treats this as assistance until a human review is recorded.
                  </p>

                  <label className="raField">
                    <span>AI system</span>
                    <input
                      value={aiTool}
                      onChange={(event) => setAiTool(event.target.value)}
                      placeholder="e.g. ChatGPT"
                    />
                  </label>

                  <label className="raField">
                    <span>What did the AI do?</span>
                    <textarea
                      value={aiTask}
                      onChange={(event) => setAiTask(event.target.value)}
                      placeholder="e.g. Summarized three papers; suggested a structure; rephrased a paragraph…"
                      rows={6}
                    />
                  </label>

                  <div className="raAiNotice">
                    <span className="raAiDot" />
                    AI outputs remain <strong>human-review required</strong> until you record a review.
                  </div>

                  <button
                    className="raButton raPrimary"
                    onClick={addAiEvent}
                    disabled={!aiTask.trim()}
                  >
                    Record AI assistance
                    <span>→</span>
                  </button>
                </section>
              </div>

              <section className="raSection">
                <div className="raSectionHead">
                  <div>
                    <p className="raKicker">EVIDENCE LIBRARY</p>
                    <h2>Your captured sources</h2>
                  </div>

                  <span className="raCountBadge">{sources.length} sources</span>
                </div>

                {sources.length ? (
                  <div className="raSourceGrid">
                    {sources.map((source) => (
                      <article key={source.id} className="raSourceCard">
                        <div className="raSourceTop">
                          <div className="raSourceIcon">S</div>
                          <div className="raSourceMeta">
                            <span className={`raPill ${source.metadata?.doiStatus === "verified" ? "verified" : ""}`}>
                              {source.metadata?.doiStatus === "verified" ? "DOI VERIFIED" : (source.metadata?.doiStatus || "NO DOI").toUpperCase()}
                            </span>
                            <span className="raPill">
                              {(source.metadata?.origin || "unknown").replace("-", " ").toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <h3>{source.title}</h3>

                        <p className="raEvidenceNote">
                          {source.evidenceNote || "No evidence note recorded yet."}
                        </p>

                        <dl className="raSourceDetails">
                          {source.metadata?.doi && (
                            <>
                              <dt>DOI</dt>
                              <dd>{source.metadata.doi}</dd>
                            </>
                          )}

                          {source.metadata?.publisher && (
                            <>
                              <dt>Publisher</dt>
                              <dd>{source.metadata.publisher}</dd>
                            </>
                          )}

                          {source.metadata?.publishedYear && (
                            <>
                              <dt>Year</dt>
                              <dd>{source.metadata.publishedYear}</dd>
                            </>
                          )}
                        </dl>

                        {source.metadata?.originReason && (
                          <p className="raOriginReason">{source.metadata.originReason}</p>
                        )}

                        <div className="raCardActions">
                          {source.metadata?.doi && (
                            <button
                              className="raSmallButton"
                              onClick={() => recheckDoi(source)}
                              disabled={checkingDoi}
                            >
                              Recheck DOI
                            </button>
                          )}

                          {source.metadata?.canonicalUrl && (
                            <a
                              className="raSmallButton"
                              href={source.metadata.canonicalUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open canonical ↗
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="raSectionEmpty">
                    <div className="raLargeIcon">S</div>
                    <h3>No evidence captured yet</h3>
                    <p>Add your first source above to begin building the research trail.</p>
                  </div>
                )}
              </section>

              <div className="raDocumentShell">
                <div className="raDocumentIntro">
                  <p className="raKicker">DOCUMENT AUDIT</p>
                  <h2>Audit the manuscript against the evidence trail.</h2>
                  <p>
                    HPS can identify claim-like sentences, resolve recognizable citation markers,
                    surface weak support, and record the audit as provenance.
                  </p>
                </div>

                <DocumentCitationInspector
                  sources={sources}
                  initialText={wordManuscript}
                  onRecordAudit={recordDocumentAudit}
                  onAcceptClaims={acceptDocumentClaims}
                />
              </div>

              <section className="raSection">
                <div className="raSectionHead">
                  <div>
                    <p className="raKicker">RESEARCH-INTEGRITY AGENT</p>
                    <h2>Human judgement queue</h2>
                    <p className="raSectionLead">
                      These are decision-support signals. They are not determinations of truth,
                      misconduct, originality, or scientific quality.
                    </p>
                  </div>

                  <div className="raFindingSummary">
                    <span><strong>{highFindings}</strong> high</span>
                    <span><strong>{warningFindings}</strong> warnings</span>
                  </div>
                </div>

                <div className="raFindings">
                  {findings.map((item) => (
                    <article key={item.id} className={`raFinding ${item.severity}`}>
                      <div className="raFindingSignal">
                        {item.severity === "high" ? "!" : item.severity === "warning" ? "△" : "i"}
                      </div>

                      <div>
                        <div className="raFindingHead">
                          <strong>{item.category.replace("-", " ").toUpperCase()}</strong>
                          <span>{item.severity.toUpperCase()}</span>
                        </div>
                        <p>{item.message}</p>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="raDecisionBar">
                  <div>
                    <p className="raKicker">HUMAN CONTROL</p>
                    <p>Review the warnings before creating the next provenance checkpoint.</p>
                  </div>

                  <div className="raDecisionActions">
                    <button className="raButton raSecondary" onClick={addReview}>
                      Add human review
                    </button>
                    <button className="raButton raSecondary" onClick={addCheckpoint}>
                      Create checkpoint
                    </button>
                    <button className="raButton raPrimary" onClick={exportManifest}>
                      Export HPS trail
                      <span>↓</span>
                    </button>
                  </div>
                </div>
              </section>

              <section className="raSection">
                <div className="raSectionHead">
                  <div>
                    <p className="raKicker">PROVENANCE TIMELINE</p>
                    <h2>How this research came together</h2>
                  </div>

                  <span className="raCountBadge">{session.events.length} events</span>
                </div>

                {session.events.length ? (
                  <div className="raTimeline">
                    {[...session.events].reverse().map((event) => (
                      <article key={event.id} className="raTimelineItem">
                        <div className={`raTimelineIcon type-${event.type}`}>
                          {eventIcon(event.type)}
                        </div>

                        <div className="raTimelineBody">
                          <div className="raTimelineHead">
                            <div>
                              <span className="raEventType">{event.type.replace("-", " ")}</span>
                              <h3>{event.title}</h3>
                            </div>

                            <time>{new Date(event.at).toLocaleString()}</time>
                          </div>

                          {event.detail && <p>{event.detail}</p>}

                          {event.type === "claim" && event.citations?.length ? (
                            <div className="raCitationChips">
                              {event.citations.map((sourceId) => {
                                const source = sources.find((candidate) => candidate.id === sourceId);
                                return (
                                  <span key={sourceId}>
                                    {source ? citationLabel(source) : `Missing source ${sourceId}`}
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}

                          {event.url && (
                            <a
                              className="raTimelineLink"
                              href={event.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open source ↗
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="raSectionEmpty">
                    <div className="raLargeIcon">◇</div>
                    <h3>Your trail is ready to begin</h3>
                    <p>Sources, claims, AI disclosures, reviews and checkpoints will appear here.</p>
                  </div>
                )}
              </section>

              <section className="raSignBar">
                <div>
                  <p className="raKicker">FINAL ACCOUNTABILITY</p>
                  <h2>Ready to turn the research trail into an HPS record?</h2>
                  <p>
                    Continue to creator signing when the evidence, AI disclosures and human review are complete.
                  </p>
                </div>

                <div className="raSignActions">
                  <Link className="raButton raPrimary" href="/create">
                    Continue to HPS signing
                    <span>→</span>
                  </Link>

                  <button className="raButton raDangerGhost" onClick={reset}>
                    Clear local session
                  </button>
                </div>
              </section>
            </>
          )}

          {notice && (
            <div className="raToast" role="status">
              <span className="raToastMark">H</span>
              <span>{notice}</span>
            </div>
          )}
        </div>
      </section>

      <style jsx global>{`
        .raRoot{
          min-height:100vh;
          background:
            radial-gradient(circle at 14% 0%, rgba(183,137,77,.08), transparent 30%),
            #0c0d0f;
          color:#f2efe8;
        }

        .raShell{padding-bottom:80px}
        .raWrap{max-width:1240px;margin:0 auto;padding-top:64px}

        .raHero{
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:48px;
          align-items:end;
          padding:46px 0 38px;
          border-bottom:1px solid #25272b;
        }

        .raEyebrow,.raKicker{
          color:#c69a5b;
          font-size:11px;
          font-weight:800;
          letter-spacing:.17em;
          text-transform:uppercase;
        }

        .raEyebrow{
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:20px;
        }

        .raMark{
          display:grid;
          place-items:center;
          width:30px;
          height:30px;
          border-radius:9px;
          background:#b42323;
          color:#fff;
          font-size:15px;
          font-weight:900;
          letter-spacing:0;
          box-shadow:0 0 0 1px rgba(255,255,255,.08) inset;
        }

        .raHero h1{
          margin:0;
          max-width:850px;
          font-size:clamp(40px,5vw,72px);
          line-height:.98;
          letter-spacing:-.045em;
          font-weight:650;
        }

        .raHero p{
          max-width:800px;
          color:#a9abb0;
          font-size:17px;
          line-height:1.7;
          margin:24px 0 0;
        }

        .raHeroTrust{
          display:flex;
          flex-direction:column;
          align-items:flex-end;
          gap:7px;
          padding-bottom:8px;
          font-size:11px;
          color:#7f8288;
          text-transform:uppercase;
          letter-spacing:.1em;
          white-space:nowrap;
        }

        .raHeroTrust span::before{
          content:"";
          display:inline-block;
          width:6px;
          height:6px;
          border-radius:50%;
          background:#6fa980;
          margin-right:9px;
          vertical-align:1px;
        }

        .raStartCard{
          margin:48px auto 0;
          max-width:900px;
          display:grid;
          grid-template-columns:110px 1fr;
          background:#121416;
          border:1px solid #2a2c31;
          border-radius:24px;
          overflow:hidden;
          box-shadow:0 24px 80px rgba(0,0,0,.24);
        }

        .raStartBadge{
          display:grid;
          place-items:center;
          font-size:42px;
          color:#c69a5b;
          background:#0f1012;
          border-right:1px solid #292b30;
        }

        .raStartContent{padding:42px}
        .raStartContent h2{font-size:32px;margin:8px 0 8px}
        .raMuted{color:#898c92;line-height:1.6;max-width:620px}

        .raSessionBar{
          margin-top:28px;
          display:flex;
          justify-content:space-between;
          gap:30px;
          align-items:center;
          padding:24px 26px;
          border:1px solid #292b30;
          background:rgba(18,20,22,.88);
          border-radius:18px;
        }

        .raSessionMain{
          display:flex;
          gap:14px;
          align-items:center;
        }

        .raStatusOrb{
          width:11px;
          height:11px;
          border-radius:50%;
          background:#79a985;
          box-shadow:0 0 0 7px rgba(121,169,133,.09);
        }

        .raSessionBar h2{margin:3px 0;font-size:23px}
        .raSessionId{font-size:11px;color:#676a70;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        .raSessionStatus{display:flex;align-items:flex-end;flex-direction:column;gap:7px}

        .raState{
          border:1px solid #3a3d43;
          background:#191b1e;
          padding:6px 10px;
          border-radius:999px;
          font-size:11px;
          text-transform:uppercase;
          letter-spacing:.09em;
        }

        .raState.danger{color:#ff9c9c;border-color:#673535;background:#241516}
        .raState.warn{color:#e6bd79;border-color:#655133;background:#211b13}
        .raState.ok{color:#9fc7aa;border-color:#38503f;background:#142019}
        .raUpdated{font-size:11px;color:#686b70}

        .raMetrics{
          display:grid;
          grid-template-columns:repeat(6,1fr);
          gap:1px;
          margin-top:14px;
          border:1px solid #27292e;
          border-radius:16px;
          overflow:hidden;
          background:#27292e;
        }

        .raMetrics div{
          background:#111315;
          padding:18px 16px;
          min-height:82px;
        }

        .raMetrics strong{
          display:block;
          font-size:25px;
          font-weight:600;
          margin-bottom:5px;
        }

        .raMetrics span{
          color:#777a80;
          font-size:10px;
          text-transform:uppercase;
          letter-spacing:.1em;
        }

        .raWorkspace{
          display:grid;
          grid-template-columns:1.05fr 1.1fr .95fr;
          gap:16px;
          margin-top:18px;
        }

        .raPanel{
          position:relative;
          background:linear-gradient(180deg,#141618 0%,#101214 100%);
          border:1px solid #2a2c31;
          border-radius:20px;
          padding:25px;
          min-width:0;
          overflow:hidden;
        }

        .raPanel::before{
          content:"";
          position:absolute;
          top:0;left:0;right:0;
          height:2px;
          background:linear-gradient(90deg,#b78a51,transparent);
          opacity:.65;
        }

        .raPanelHead{
          display:flex;
          align-items:center;
          gap:13px;
          margin-bottom:13px;
        }

        .raPanelHead h3{margin:2px 0 0;font-size:21px}
        .raStep{
          display:grid;
          place-items:center;
          min-width:39px;
          height:39px;
          border-radius:12px;
          background:#1b1c1f;
          border:1px solid #32343a;
          color:#c69a5b;
          font-size:12px;
          font-weight:800;
        }

        .raPanelIntro{
          color:#888b90;
          font-size:13px;
          line-height:1.55;
          min-height:60px;
          margin:0 0 18px;
        }

        .raField{
          display:block;
          margin-top:13px;
        }

        .raField > span{
          display:flex;
          justify-content:space-between;
          margin:0 0 7px;
          color:#c8c9cc;
          font-size:12px;
          font-weight:650;
        }

        .raField em{
          color:#676a70;
          font-size:10px;
          font-style:normal;
          font-weight:500;
          text-transform:uppercase;
          letter-spacing:.08em;
        }

        .raField input,.raField textarea{
          width:100%;
          box-sizing:border-box;
          border:1px solid #303238;
          background:#0b0d0f;
          color:#f4f0e8;
          border-radius:11px;
          padding:12px 13px;
          outline:none;
          font:inherit;
          font-size:14px;
          line-height:1.45;
          transition:border-color .18s,box-shadow .18s,background .18s;
          resize:vertical;
        }

        .raField input::placeholder,.raField textarea::placeholder{color:#585b61}

        .raField input:focus,.raField textarea:focus{
          border-color:#8c6b40;
          background:#0f1113;
          box-shadow:0 0 0 3px rgba(183,138,81,.09);
        }

        .raButton{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:18px;
          min-height:44px;
          padding:0 16px;
          border-radius:10px;
          border:1px solid #383b41;
          text-decoration:none;
          font-size:12px;
          font-weight:800;
          letter-spacing:.04em;
          cursor:pointer;
          transition:transform .15s,background .15s,border-color .15s;
        }

        .raButton:hover{transform:translateY(-1px)}
        .raButton:disabled{opacity:.45;cursor:not-allowed;transform:none}

        .raPrimary{
          margin-top:18px;
          width:100%;
          background:#eee8dc;
          border-color:#eee8dc;
          color:#111315;
        }

        .raPrimary:hover{background:#fff;border-color:#fff}
        .raSecondary{background:#17191c;color:#f0eee8}
        .raDangerGhost{background:transparent;color:#b88989;border-color:#453031}

        .raEvidencePicker{
          margin-top:15px;
          border-top:1px solid #26282d;
          padding-top:15px;
        }

        .raPickerLabel{
          display:flex;
          justify-content:space-between;
          align-items:center;
          font-size:12px;
          font-weight:650;
          color:#c8c9cc;
          margin-bottom:9px;
        }

        .raPickerLabel small{color:#6d7075;font-weight:500}
        .raSourceChoices{display:grid;gap:7px}

        .raChoice{
          display:flex;
          gap:9px;
          align-items:flex-start;
          border:1px solid #2c2e33;
          background:#0c0e10;
          border-radius:10px;
          padding:10px;
          cursor:pointer;
          color:#93969b;
          font-size:12px;
          line-height:1.4;
        }

        .raChoice.selected{
          border-color:#745d3d;
          background:#17130e;
          color:#dfd5c5;
        }

        .raChoice input{display:none}

        .raChoiceMark{
          display:grid;
          place-items:center;
          flex:0 0 auto;
          width:18px;
          height:18px;
          border-radius:5px;
          border:1px solid #404349;
          color:transparent;
          font-size:10px;
        }

        .raChoice.selected .raChoiceMark{
          color:#151515;
          background:#c69a5b;
          border-color:#c69a5b;
        }

        .raEmpty{
          border:1px dashed #303238;
          border-radius:10px;
          padding:13px;
          color:#65686e;
          font-size:12px;
        }

        .raAiNotice{
          margin-top:15px;
          padding:11px 12px;
          border:1px solid #3b3021;
          border-radius:10px;
          background:#18140f;
          color:#ac9a7e;
          font-size:12px;
          line-height:1.45;
        }

        .raAiDot{
          display:inline-block;
          width:7px;height:7px;
          border-radius:50%;
          background:#c89554;
          margin-right:8px;
        }

        .raSection{
          margin-top:22px;
          padding:30px;
          background:#111315;
          border:1px solid #292b30;
          border-radius:20px;
        }

        .raSectionHead{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:24px;
          padding-bottom:21px;
          border-bottom:1px solid #27292e;
        }

        .raSectionHead h2,.raDocumentIntro h2{
          margin:6px 0 0;
          font-size:28px;
          letter-spacing:-.02em;
        }

        .raSectionLead,.raDocumentIntro p{
          max-width:760px;
          color:#85888e;
          line-height:1.6;
          margin:10px 0 0;
          font-size:13px;
        }

        .raCountBadge{
          border:1px solid #33363b;
          background:#17191b;
          color:#92959a;
          border-radius:999px;
          padding:7px 10px;
          font-size:11px;
          white-space:nowrap;
        }

        .raSourceGrid{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(290px,1fr));
          gap:12px;
          margin-top:20px;
        }

        .raSourceCard{
          border:1px solid #2d2f34;
          background:#0e1012;
          border-radius:15px;
          padding:20px;
        }

        .raSourceTop{
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:center;
        }

        .raSourceIcon,.raLargeIcon{
          display:grid;
          place-items:center;
          width:34px;height:34px;
          border:1px solid #3b3d42;
          background:#17191b;
          border-radius:10px;
          color:#c69a5b;
          font-weight:850;
        }

        .raSourceMeta{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}

        .raPill{
          border:1px solid #33363b;
          border-radius:999px;
          color:#797c82;
          padding:5px 7px;
          font-size:8px;
          letter-spacing:.08em;
        }

        .raPill.verified{
          color:#8db59a;
          border-color:#334a3b;
          background:#111b15;
        }

        .raSourceCard h3{
          margin:17px 0 10px;
          font-size:17px;
          line-height:1.35;
        }

        .raEvidenceNote{
          color:#9a9da2;
          font-size:13px;
          line-height:1.55;
          min-height:42px;
        }

        .raSourceDetails{
          display:grid;
          grid-template-columns:auto 1fr;
          gap:6px 10px;
          padding-top:13px;
          border-top:1px solid #24262a;
          font-size:11px;
        }

        .raSourceDetails dt{color:#62656b}
        .raSourceDetails dd{margin:0;color:#a4a7ab;overflow-wrap:anywhere}
        .raOriginReason{font-size:11px;color:#66696f;line-height:1.5}
        .raCardActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}

        .raSmallButton{
          border:1px solid #34373c;
          background:#16181a;
          color:#aeb0b4;
          border-radius:8px;
          padding:8px 10px;
          font-size:10px;
          text-decoration:none;
          cursor:pointer;
        }

        .raSectionEmpty{
          text-align:center;
          padding:42px 20px 24px;
          color:#76797e;
        }

        .raSectionEmpty .raLargeIcon{margin:0 auto 14px}
        .raSectionEmpty h3{color:#c7c7c4;margin:0 0 5px}
        .raSectionEmpty p{margin:0;font-size:13px}

        .raDocumentShell{
          margin-top:22px;
          padding:30px;
          background:#111315;
          border:1px solid #292b30;
          border-radius:20px;
        }

        .raDocumentIntro{
          padding-bottom:18px;
          margin-bottom:8px;
          border-bottom:1px solid #27292e;
        }

        .raDocumentShell .statement{
          margin-top:18px !important;
          background:#0e1012;
          border:1px solid #292b30;
          border-radius:16px;
          padding:22px;
        }

        .raDocumentShell .statement h2{
          font-size:21px;
          margin-top:4px;
        }

        .raDocumentShell textarea{
          border-radius:11px !important;
          border:1px solid #303238 !important;
          background:#090b0d !important;
          color:#f4f0e8 !important;
          padding:14px !important;
          font-family:inherit !important;
          line-height:1.55 !important;
        }

        .raFindingSummary{
          display:flex;
          gap:7px;
          flex-wrap:wrap;
        }

        .raFindingSummary span{
          border:1px solid #33363b;
          border-radius:999px;
          padding:7px 10px;
          font-size:11px;
          color:#8b8e93;
        }

        .raFindingSummary strong{color:#d8d9d6}
        .raFindings{display:grid;gap:9px;margin-top:18px}

        .raFinding{
          display:grid;
          grid-template-columns:34px 1fr;
          gap:13px;
          border:1px solid #2d3035;
          background:#0e1012;
          border-radius:13px;
          padding:15px;
        }

        .raFinding.high{border-color:#4a2d30;background:#151012}
        .raFinding.warning{border-color:#463a2b;background:#14120f}

        .raFindingSignal{
          display:grid;
          place-items:center;
          width:30px;height:30px;
          border:1px solid #3a3c41;
          border-radius:9px;
          color:#979a9f;
          font-weight:800;
        }

        .raFinding.high .raFindingSignal{color:#e58c91;border-color:#62353a}
        .raFinding.warning .raFindingSignal{color:#d3ad70;border-color:#604e34}

        .raFindingHead{
          display:flex;
          justify-content:space-between;
          gap:16px;
          align-items:center;
          font-size:10px;
          letter-spacing:.08em;
        }

        .raFindingHead span{color:#686b70}
        .raFinding p{margin:6px 0 0;color:#a5a7ab;font-size:13px;line-height:1.55}

        .raDecisionBar{
          display:flex;
          justify-content:space-between;
          gap:24px;
          align-items:center;
          margin-top:20px;
          padding-top:20px;
          border-top:1px solid #27292e;
        }

        .raDecisionBar p{margin:5px 0 0;color:#74777c;font-size:12px}
        .raDecisionActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .raDecisionActions .raButton{width:auto;margin:0;min-width:145px}

        .raTimeline{position:relative;margin-top:22px}
        .raTimeline::before{
          content:"";
          position:absolute;
          left:18px;
          top:12px;
          bottom:20px;
          width:1px;
          background:#2b2d32;
        }

        .raTimelineItem{
          position:relative;
          display:grid;
          grid-template-columns:38px 1fr;
          gap:16px;
          padding-bottom:13px;
        }

        .raTimelineIcon{
          z-index:1;
          display:grid;
          place-items:center;
          width:36px;height:36px;
          border-radius:11px;
          border:1px solid #34363c;
          background:#17191c;
          color:#bf9660;
          font-size:9px;
          font-weight:900;
        }

        .raTimelineIcon.type-ai{color:#e0a562;border-color:#574128;background:#1b1510}
        .raTimelineIcon.type-review{color:#86b594;border-color:#36513f;background:#101a14}
        .raTimelineIcon.type-checkpoint{color:#b9a2d2;border-color:#4a3d57;background:#151119}

        .raTimelineBody{
          border:1px solid #2d2f34;
          background:#0e1012;
          border-radius:14px;
          padding:16px 17px;
        }

        .raTimelineHead{
          display:flex;
          justify-content:space-between;
          gap:20px;
          align-items:flex-start;
        }

        .raTimelineHead h3{margin:3px 0 0;font-size:15px}
        .raEventType{
          color:#777a80;
          font-size:9px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.1em;
        }

        .raTimelineHead time{
          color:#5f6267;
          font-size:10px;
          white-space:nowrap;
        }

        .raTimelineBody p{
          color:#94979c;
          font-size:12px;
          line-height:1.55;
          margin:10px 0 0;
        }

        .raCitationChips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
        .raCitationChips span{
          border:1px solid #373a40;
          background:#151719;
          border-radius:999px;
          color:#96999e;
          padding:5px 8px;
          font-size:9px;
        }

        .raTimelineLink{
          display:inline-block;
          margin-top:10px;
          color:#bd9460;
          font-size:11px;
          text-decoration:none;
        }

        .raSignBar{
          display:flex;
          justify-content:space-between;
          gap:36px;
          align-items:center;
          margin-top:22px;
          padding:28px 30px;
          border:1px solid #4b3e2e;
          background:linear-gradient(110deg,#17130e,#111315 62%);
          border-radius:20px;
        }

        .raSignBar h2{margin:5px 0 7px;font-size:25px}
        .raSignBar p:last-child{color:#8b8e92;max-width:700px;margin:0;font-size:13px;line-height:1.55}
        .raSignActions{display:flex;gap:8px;flex-direction:column;min-width:230px}
        .raSignActions .raButton{width:100%;margin:0}

        .raToast{
          position:sticky;
          bottom:18px;
          z-index:20;
          display:flex;
          align-items:center;
          gap:11px;
          width:max-content;
          max-width:min(700px,calc(100vw - 32px));
          margin:18px auto 0;
          padding:11px 14px;
          border:1px solid #3b3d42;
          border-radius:12px;
          background:rgba(20,22,24,.94);
          backdrop-filter:blur(14px);
          box-shadow:0 16px 50px rgba(0,0,0,.28);
          color:#c6c7c4;
          font-size:12px;
        }

        .raToastMark{
          display:grid;
          place-items:center;
          width:24px;height:24px;
          border-radius:7px;
          background:#b42323;
          color:#fff;
          font-weight:900;
        }

        @media (max-width:1050px){
          .raWorkspace{grid-template-columns:1fr 1fr}
          .raAiPanel{grid-column:1 / -1}
          .raMetrics{grid-template-columns:repeat(3,1fr)}
        }

        @media (max-width:760px){
          .raWrap{padding-top:34px}
          .raHero{grid-template-columns:1fr;gap:18px;padding-top:30px}
          .raHeroTrust{align-items:flex-start}
          .raWorkspace{grid-template-columns:1fr}
          .raAiPanel{grid-column:auto}
          .raMetrics{grid-template-columns:repeat(2,1fr)}
          .raSessionBar,.raSectionHead,.raDecisionBar,.raSignBar{
            align-items:flex-start;
            flex-direction:column;
          }
          .raSessionStatus{align-items:flex-start}
          .raDecisionActions,.raSignActions{width:100%}
          .raDecisionActions .raButton{width:100%}
          .raStartCard{grid-template-columns:1fr}
          .raStartBadge{display:none}
          .raStartContent{padding:26px}
          .raSection,.raDocumentShell{padding:20px}
          .raTimelineHead{flex-direction:column;gap:5px}
          .raHero h1{font-size:42px}
        }
      `}</style>
    </main>
  );
}
