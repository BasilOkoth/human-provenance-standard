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
          const payload = JSON.parse(imported) as { title?: string; text?: string; documentUrl?: string; capturedAt?: string; manuscriptHash?: string; scope?: string };
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

  const findings = useMemo<Finding[]>(() => {
    if (!session) return [];
    const events = session.events;
    const sourceEvents = events.filter((event) => event.type === "source");
    const claimEvents = events.filter((event) => event.type === "claim");
    const aiEvents = events.filter((event) => event.type === "ai");
    const reviews = events.filter((event) => event.type === "review");
    const items: Finding[] = [];

    claimEvents.forEach((claimEvent) => {
      const linked = claimEvent.citations || [];
      if (!linked.length) {
        items.push({ id: `uncited-${claimEvent.id}`, severity: "high", category: "citation", message: `Unlinked claim: “${claimEvent.detail?.slice(0, 120) || claimEvent.title}”. Link at least one supporting source.` });
        return;
      }

      const linkedSources = sourceEvents.filter((source) => linked.includes(source.id));
      if (!linkedSources.length) {
        items.push({ id: `missing-source-${claimEvent.id}`, severity: "high", category: "citation", message: "A claim points to source IDs that are no longer present in the research trail." });
      }
      if (linkedSources.every((source) => source.metadata?.origin === "aggregator" || source.metadata?.origin === "repository")) {
        items.push({ id: `secondary-origin-${claimEvent.id}`, severity: "warning", category: "source-origin", message: `Claim “${claimEvent.detail?.slice(0, 95)}…” is supported only by repository/aggregator copies. Check the canonical publisher or original record.` });
      }
      if (linkedSources.some((source) => source.metadata?.doi && source.metadata?.doiStatus !== "verified")) {
        items.push({ id: `doi-support-${claimEvent.id}`, severity: "warning", category: "doi", message: `At least one DOI linked to “${claimEvent.detail?.slice(0, 95)}…” has not been verified against Crossref.` });
      }
    });

    sourceEvents.forEach((source) => {
      const metadata = source.metadata;
      if (metadata?.doi && metadata.doiStatus === "not-found") {
        items.push({ id: `doi-not-found-${source.id}`, severity: "high", category: "doi", message: `DOI ${metadata.doi} was not found in Crossref. Check for a typo or verify it manually.` });
      }
      if (metadata?.origin === "aggregator") {
        items.push({ id: `origin-${source.id}`, severity: "warning", category: "source-origin", message: `“${source.title}” appears to be an aggregator copy. Prefer or verify the canonical DOI/publisher record.` });
      }
      if (!source.evidenceNote?.trim()) {
        items.push({ id: `evidence-note-${source.id}`, severity: "info", category: "citation", message: `“${source.title}” has no evidence note. Record what the source actually supports so citation checks are more meaningful.` });
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

    if (aiEvents.length > reviews.length) {
      items.push({ id: "ai-review-gap", severity: "high", category: "ai-review", message: "At least one AI-assistance event has not yet been followed by a human-review checkpoint." });
    }
    if (events.length > 0 && !events.some((event) => event.type === "checkpoint")) {
      items.push({ id: "checkpoint-gap", severity: "warning", category: "checkpoint", message: "No provenance checkpoint has been created for this session yet." });
    }
    if (!items.length && events.length > 0) {
      items.push({ id: "clear", severity: "info", category: "integrity", message: "No obvious research-integrity or provenance gaps detected by the current transparent rules." });
    }
    return items;
  }, [session]);

  function mutate(add: ResearchEvent) {
    setSession((current) => current ? { ...current, updatedAt: nowIso(), events: [...current.events, add] } : current);
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
    setSession({ version: "hps-research-session/0.4", id: uid("session"), title: clean, startedAt: at, updatedAt: at, events: [] });
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
      ? message.author.map((author: { given?: string; family?: string }) => [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean)
      : [];
    const dateParts = message.published?.["date-parts"]?.[0] || message.issued?.["date-parts"]?.[0] || [];
    const canonicalUrl = typeof message.URL === "string" ? message.URL : `https://doi.org/${doi}`;
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
          replaceEvent(id, (event) => ({ ...event, metadata: { ...event.metadata!, doiStatus: "not-found" } }));
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
        replaceEvent(id, (event) => ({ ...event, metadata: { ...event.metadata!, doiStatus: "error" } }));
        setNotice(error instanceof Error ? `Source saved; DOI verification could not complete: ${error.message}` : "Source saved; DOI verification could not complete.");
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
        replaceEvent(source.id, (event) => ({ ...event, metadata: { ...event.metadata!, doiStatus: "not-found" } }));
        setNotice(`DOI ${doi} was not found in Crossref.`);
      } else {
        const origin = detectSourceOrigin(source.url || "", result.canonicalUrl);
        replaceEvent(source.id, (event) => ({ ...event, title: result.title || event.title, metadata: {
          ...event.metadata!, doiStatus: "verified", crossrefType: result.crossrefType, publisher: result.publisher,
          publishedYear: result.publishedYear, authors: result.authors, canonicalUrl: result.canonicalUrl,
          origin: origin.origin, originReason: origin.originReason,
        } }));
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
    mutate({ id: uid("claim"), type: "claim", at: nowIso(), title: "Research claim", detail: claim.trim(), citations: [...claimSources] });
    setClaim("");
    setClaimSources([]);
  }

  function toggleClaimSource(sourceId: string) {
    setClaimSources((current) => current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]);
  }

  function addAiEvent() {
    if (!session || !aiTask.trim()) return;
    mutate({ id: uid("ai"), type: "ai", at: nowIso(), title: `${aiTool.trim() || "AI tool"} assistance`, detail: aiTask.trim(), reviewed: false });
    setAiTask("");
  }

  function addReview() {
    if (!session) return;
    mutate({ id: uid("review"), type: "review", at: nowIso(), title: "Human review", detail: "Researcher reviewed the current research state, including agent warnings, and accepts responsibility for the retained content.", reviewed: true });
  }

  function addCheckpoint() {
    if (!session) return;
    mutate({ id: uid("checkpoint"), type: "checkpoint", at: nowIso(), title: `Provenance checkpoint #${session.events.filter((event) => event.type === "checkpoint").length + 1}`, detail: "Snapshot marker created before HPS signing or institutional review." });
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

  function acceptDocumentClaims(claimRows: Array<{ sentence: string; sourceIds: string[]; status: string; supportScore: number }>, audit: DocumentAuditResult) {
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
    setNotice(`${claimRows.length} audited manuscript claim${claimRows.length === 1 ? "" : "s"} added to the HPS provenance trail.`);
  }

  async function exportManifest() {
    if (!session) return;
    const canonical = JSON.stringify(session);
    const hash = await sha256Text(canonical);
    const manifest = {
      hpsType: "trusted-research-trail",
      hpsVersion: "0.4",
      session,
      integrity: { algorithm: "SHA-256", canonicalSessionHash: hash },
      agentAssessment: {
        method: "transparent-rule-based-prototype",
        generatedAt: nowIso(),
        findings,
        limitation: "Warnings are decision-support signals, not determinations of truth, misconduct, originality, or research quality.",
      },
      disclosure: { captureMode: "explicit-user-approved-events", hiddenBrowsingCaptured: false, keystrokesCaptured: false },
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
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

  const severityStyle = (severity: Finding["severity"]) => ({
    borderLeft: `4px solid ${severity === "high" ? "#ef4444" : severity === "warning" ? "#f59e0b" : "#64748b"}`,
  });

  return (
    <main>
      <section className="shell" style={{ paddingBottom: 64 }}>
        <Nav />
        <div style={{ maxWidth: 1080, margin: "72px auto 0" }}>
          <p className="eyebrow">HPS TRUSTED RESEARCH AGENT · CATALYST PROTOTYPE</p>
          <h1 style={{ maxWidth: 900, marginBottom: 18 }}>Record the research trail, not the researcher.</h1>
          <p className="lede" style={{ maxWidth: 860 }}>
            Capture meaningful, user-approved provenance events across research: sources, claims, claim-to-citation links,
            DOI verification, source-origin checks, AI assistance, human review, contradiction candidates and checkpoints.
            The prototype never records keystrokes or hidden browsing activity.
          </p>

          {!session ? (
            <section className="recordCard" style={{ marginTop: 36, maxWidth: 760 }}>
              <p className="micro">START A SESSION</p>
              <h2>Begin a verifiable research trail.</h2>
              <label style={{ display: "grid", gap: 8, marginTop: 20 }}>
                <span>Research title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Human provenance in agentic research" />
              </label>
              <div className="actions" style={{ marginTop: 22 }}>
                <button className="button primary" type="button" onClick={startSession}>Start research session</button>
              </div>
            </section>
          ) : (
            <>
              <section className="recordCard" style={{ marginTop: 34 }}>
                <p className="micro">ACTIVE RESEARCH SESSION</p>
                <h2>{session.title}</h2>
                <p style={{ opacity: 0.72 }}>Session ID: {session.id}</p>
                <div className="trustLine" style={{ marginTop: 18 }}>
                  <span>{sources.length} sources</span>
                  <span>{claims.length} claims</span>
                  <span>{claims.filter((event) => event.citations?.length).length} cited claims</span>
                  <span>{session.events.filter((event) => event.type === "ai").length} AI events</span>
                  <span>{session.events.filter((event) => event.type === "review").length} reviews</span>
                  <span>{session.events.filter((event) => event.type === "checkpoint").length} checkpoints</span>
                </div>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18, marginTop: 20 }}>
                <section className="recordCard">
                  <p className="micro">SOURCE + DOI</p>
                  <h3>Capture and verify evidence</h3>
                  <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Source title (optional)" />
                  <input style={{ marginTop: 10 }} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Publisher/repository URL" />
                  <input style={{ marginTop: 10 }} value={sourceDoi} onChange={(event) => setSourceDoi(event.target.value)} placeholder="DOI, e.g. 10.1038/..." />
                  <textarea style={{ marginTop: 10 }} value={sourceEvidence} onChange={(event) => setSourceEvidence(event.target.value)} placeholder="Evidence note: what does this source actually support?" rows={3} />
                  <button className="button ghost" style={{ marginTop: 14 }} onClick={addSource} disabled={checkingDoi}>{checkingDoi ? "Checking DOI…" : "Add + verify source"}</button>
                </section>

                <section className="recordCard">
                  <p className="micro">CLAIM → CITATION</p>
                  <h3>Link claims to evidence</h3>
                  <textarea value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="What claim are you making?" rows={4} />
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {sources.map((source) => (
                      <label key={source.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                        <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={claimSources.includes(source.id)} onChange={() => toggleClaimSource(source.id)} />
                        <span>{citationLabel(source)}</span>
                      </label>
                    ))}
                    {!sources.length && <span style={{ opacity: 0.65 }}>Capture at least one source to create a cited claim.</span>}
                  </div>
                  <button className="button ghost" style={{ marginTop: 14 }} onClick={addClaim}>Add claim with citations</button>
                </section>

                <section className="recordCard">
                  <p className="micro">AI DISCLOSURE</p>
                  <h3>Declare machine assistance</h3>
                  <input value={aiTool} onChange={(event) => setAiTool(event.target.value)} placeholder="AI tool" />
                  <textarea style={{ marginTop: 10 }} value={aiTask} onChange={(event) => setAiTask(event.target.value)} placeholder="e.g. Restructured paragraph; summarized three papers" rows={3} />
                  <button className="button ghost" style={{ marginTop: 14 }} onClick={addAiEvent}>Record AI assistance</button>
                </section>
              </div>

              <section className="statement" style={{ marginTop: 24 }}>
                <p className="eyebrow">SOURCE RESOLUTION</p>
                <h2>DOI, origin and citation evidence.</h2>
                <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                  {sources.map((source) => (
                    <article key={source.id} className="recordCard" style={{ padding: 18 }}>
                      <strong>{source.title}</strong>
                      <p style={{ margin: "8px 0" }}>{source.evidenceNote || "No evidence note recorded."}</p>
                      <div className="trustLine" style={{ marginTop: 10 }}>
                        <span>DOI: {source.metadata?.doi || "none"}</span>
                        <span>Status: {source.metadata?.doiStatus || "not-provided"}</span>
                        <span>Origin: {source.metadata?.origin || "unknown"}</span>
                        {source.metadata?.publishedYear && <span>{source.metadata.publishedYear}</span>}
                      </div>
                      {source.metadata?.publisher && <p style={{ opacity: 0.72 }}>Publisher: {source.metadata.publisher}</p>}
                      {source.metadata?.originReason && <p style={{ opacity: 0.72 }}>{source.metadata.originReason}</p>}
                      <div className="actions" style={{ marginTop: 10 }}>
                        {source.metadata?.doi && <button className="button ghost" onClick={() => recheckDoi(source)} disabled={checkingDoi}>Recheck DOI</button>}
                        {source.metadata?.canonicalUrl && <a className="button ghost" href={source.metadata.canonicalUrl} target="_blank" rel="noreferrer">Open canonical record</a>}
                      </div>
                    </article>
                  ))}
                  {!sources.length && <p>No sources captured yet.</p>}
                </div>
              </section>

              <DocumentCitationInspector
                sources={sources}
                initialText={wordManuscript}
                onRecordAudit={recordDocumentAudit}
                onAcceptClaims={acceptDocumentClaims}
              />

              <section className="statement" style={{ marginTop: 24 }}>
                <p className="eyebrow">RESEARCH-INTEGRITY AGENT</p>
                <h2>Warnings requiring human judgement</h2>
                <p style={{ maxWidth: 820, opacity: 0.72 }}>
                  HPS flags provenance and citation risks. Contradiction detection is deliberately a review signal—not a truth engine and not an accusation of misconduct.
                </p>
                <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
                  {findings.map((item) => (
                    <div key={item.id} className="recordCard" style={{ padding: 18, ...severityStyle(item.severity) }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <strong>{item.category.replace("-", " ").toUpperCase()}</strong>
                        <span style={{ opacity: 0.65 }}>{item.severity.toUpperCase()}</span>
                      </div>
                      <p style={{ marginBottom: 0 }}>{item.message}</p>
                    </div>
                  ))}
                </div>
                <div className="actions" style={{ marginTop: 20 }}>
                  <button className="button ghost" onClick={addReview}>Add human review</button>
                  <button className="button ghost" onClick={addCheckpoint}>Create checkpoint</button>
                  <button className="button primary" onClick={exportManifest}>Export HPS research trail</button>
                </div>
              </section>

              <section className="statement" style={{ marginTop: 24 }}>
                <p className="eyebrow">PROVENANCE TIMELINE</p>
                <h2>What happened, in order.</h2>
                <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
                  {[...session.events].reverse().map((event) => (
                    <article key={event.id} className="recordCard" style={{ padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <strong>{event.title}</strong>
                        <span style={{ opacity: 0.65 }}>{new Date(event.at).toLocaleString()}</span>
                      </div>
                      {event.detail && <p style={{ marginBottom: 6 }}>{event.detail}</p>}
                      {event.type === "claim" && event.citations?.length ? (
                        <div style={{ marginTop: 10 }}>
                          <strong>Linked citations</strong>
                          <ul>
                            {event.citations.map((sourceId) => {
                              const source = sources.find((candidate) => candidate.id === sourceId);
                              return <li key={sourceId}>{source ? citationLabel(source) : `Missing source ${sourceId}`}</li>;
                            })}
                          </ul>
                        </div>
                      ) : null}
                      {event.url && <a href={event.url} target="_blank" rel="noreferrer">{event.url}</a>}
                    </article>
                  ))}
                  {!session.events.length && <p>No provenance events yet.</p>}
                </div>
              </section>

              <div className="actions" style={{ marginTop: 24 }}>
                <Link className="button primary" href="/create">Continue to HPS signing</Link>
                <button className="button ghost" onClick={reset}>Clear local session</button>
              </div>
            </>
          )}

          {notice && <p style={{ marginTop: 18 }}>{notice}</p>}
        </div>
      </section>
    </main>
  );
}
