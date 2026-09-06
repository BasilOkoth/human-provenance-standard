"use client";

import { useEffect, useState } from "react";
import { auditDocument, type AuditSource, type DocumentAuditResult } from "@/lib/documentCitationAudit";

type AcceptedClaim = { sentence: string; sourceIds: string[]; status: string; supportScore: number };

type Props = {
  sources: AuditSource[];
  initialText?: string;
  onAcceptClaims: (claims: AcceptedClaim[], audit: DocumentAuditResult) => void;
  onRecordAudit: (audit: DocumentAuditResult) => void;
};

function pct(value: number) { return `${Math.round(value * 100)}%`; }

export default function DocumentCitationInspector({ sources, initialText = "", onAcceptClaims, onRecordAudit }: Props) {
  const [text, setText] = useState(initialText);
  const [audit, setAudit] = useState<DocumentAuditResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  async function runAudit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const result = await auditDocument(text, sources);
      setAudit(result);
      setSelected(result.claims.filter((c) => c.status !== "uncited" && c.status !== "unresolved-citation").map((c) => c.id));
      onRecordAudit(result);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  function acceptSelected() {
    if (!audit) return;
    const claims = audit.claims.filter((c) => selected.includes(c.id)).map((c) => ({ sentence: c.sentence, sourceIds: c.resolvedSourceIds, status: c.status, supportScore: c.supportScore }));
    onAcceptClaims(claims, audit);
  }

  return (
    <section className="statement" style={{ marginTop: 24 }}>
      <p className="eyebrow">DOCUMENT-AWARE CITATION CHECK</p>
      <h2>Audit the manuscript before signing it.</h2>
      <p style={{ maxWidth: 860, opacity: 0.72 }}>
        Paste manuscript text or a section. HPS identifies claim-like sentences, resolves recognizable in-text citations against sources already captured in the session, and flags uncited, unresolved, weakly supported or potentially conflicting claims for human review.
      </p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste a manuscript section here, including in-text citations such as (Kaudo, 2024), Kaudo 2024, [1], or a DOI..."
        rows={12}
        style={{ marginTop: 14, width: "100%" }}
      />
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="button primary" onClick={runAudit} disabled={busy || !text.trim()}>{busy ? "Auditing…" : "Audit manuscript"}</button>
      </div>

      {audit && (
        <>
          <div className="trustLine" style={{ marginTop: 18 }}>
            <span>{audit.claimCount} claim-like sentences</span>
            <span>{audit.supportedClaims} supported</span>
            <span>{audit.uncitedClaims} uncited</span>
            <span>{audit.unresolvedCitations} unresolved citations</span>
            <span>{audit.weakSupportClaims} weak-support flags</span>
            <span>{audit.conflictCandidates} conflict candidates</span>
          </div>
          <p style={{ marginTop: 12, opacity: 0.68, fontSize: 13 }}>Manuscript SHA-256: {audit.manuscriptHash}</p>

          <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
            {audit.claims.map((claim) => {
              const border = claim.status === "supported" ? "#22c55e" : claim.status === "uncited" || claim.status === "unresolved-citation" ? "#ef4444" : "#f59e0b";
              return (
                <article key={claim.id} className="recordCard" style={{ padding: 18, borderLeft: `4px solid ${border}` }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" style={{ width: "auto", marginTop: 4 }} checked={selected.includes(claim.id)} onChange={() => toggle(claim.id)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <strong>{claim.status.replace(/-/g, " ").toUpperCase()}</strong>
                        <span style={{ opacity: 0.65 }}>support signal {pct(claim.supportScore)}</span>
                      </div>
                      <p>{claim.sentence}</p>
                      {claim.citationMarkers.length > 0 && (
                        <p style={{ opacity: 0.72, fontSize: 13 }}>Citations detected: {claim.citationMarkers.map((m) => m.raw).join(" · ")}</p>
                      )}
                      {claim.notes.length > 0 && <ul>{claim.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="button primary" onClick={acceptSelected} disabled={!selected.length}>Accept selected claims into HPS trail</button>
          </div>
          <p style={{ marginTop: 12, opacity: 0.68, fontSize: 13 }}>
            HPS does not certify truth or misconduct. The audit is decision support. Human review remains required before signing.
          </p>
        </>
      )}
    </section>
  );
}
