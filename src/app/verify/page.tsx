"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fingerprintFile } from "@/lib/hps/fingerprint-client";
import { buildContentIntegrityWitness } from "@/lib/hps/content-witness-client";
import {
  diffDocumentText,
  type HpsTextChange,
  type HpsTextDiffResult,
} from "@/lib/hps/text-diff";

const shortCode = (id?: string) => id?.split("-").pop() || "";

const classLabel: Record<string, string> = {
  exact_original: "EXACT ASSET",
  registered_derivative: "REGISTERED DERIVATIVE",
  verified_derivative: "VERIFIED DERIVATIVE",
  cross_format_match: "CROSS-FORMAT MATCH",
  derivative_candidate: "POSSIBLE DERIVATIVE",
  modified_derivative: "RELATED / MODIFIED",
  revoked: "REVOKED",
};

type PublicTextAnalysis = {
  diff: HpsTextDiffResult;
  textChanges: HpsTextChange[];
  materialValueChanges: HpsTextChange[];
  presentationChanges: HpsTextChange[];
};

function containsLetters(value: string) {
  return /\p{L}/u.test(value);
}

function isLikelyListMarker(value: string) {
  const compact = value.replace(/\s+/g, "");
  return /^(?:\(?\d{1,3}\)?[.)]?|[ivxlcdm]{1,6}[.)])$/i.test(compact);
}

function classifyPublicTextAnalysis(diff: HpsTextDiffResult): PublicTextAnalysis {
  // Presentation/extraction noise must be identified first. A list marker such
  // as "1." contains a number, but it is not a material numerical change.
  const presentationChanges = diff.changes.filter(change => {
    if (change.category === "formatting" || change.category === "punctuation") {
      return true;
    }

    const only = change.originalText || change.candidateText;
    if (isLikelyListMarker(only)) return true;

    return false;
  });

  const presentationSet = new Set(presentationChanges);

  const materialValueChanges = diff.changes.filter(
    change => change.material && !presentationSet.has(change)
  );

  const materialSet = new Set(materialValueChanges);

  const textChanges = diff.changes.filter(change => {
    if (presentationSet.has(change) || materialSet.has(change)) return false;
    return (
      containsLetters(change.originalText) ||
      containsLetters(change.candidateText)
    );
  });

  return {
    diff,
    textChanges,
    materialValueChanges,
    presentationChanges,
  };
}

function displayChangeCategory(change: HpsTextChange) {
  if (change.category !== "mixed") return change.category.toUpperCase();

  const text = `${change.originalText} ${change.candidateText}`.trim();
  const wordCount = (text.match(/\p{L}+(?:['-]\p{L}+)*/gu) || []).length;

  if (wordCount >= 2) return "PHRASE";
  if (wordCount === 1) return "WORD";
  return "TEXT";
}

function VerifyContent() {
  const [fileResult, setFileResult] = useState<any>(null);
  const [witnessResult, setWitnessResult] = useState<any>(null);
  const [publicTextAnalysis, setPublicTextAnalysis] =
    useState<PublicTextAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [manifestText, setManifestText] = useState("");
  const [manifestResult, setManifestResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function verifyFile(file?: File) {
    if (!file) return;

    setBusy(true);
    setError("");
    setFileResult(null);
    setWitnessResult(null);
    setPublicTextAnalysis(null);

    try {
      const fingerprint = await fingerprintFile(file);

      const r = await fetch("/api/verify/asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetHash: fingerprint.exactSha256,
          fingerprint,
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.error || "Unable to verify file.");
      }

      setFileResult({
        ...data,
        fileName: file.name,
        fingerprint,
      });

      const best = data?.records?.[0];

      if (
        best &&
        best.verificationClass !== "exact_original" &&
        best.status !== "revoked"
      ) {
        try {
          // Candidate text is extracted locally once. public_values mode sends
          // only selected critical-value witness data to HPS. public_text mode
          // compares the candidate locally against the registered public text.
          const candidate = await buildContentIntegrityWitness(file, {
            mode: "public_values",
          });

          const [witnessResponse, witnessMetaResponse] = await Promise.all([
            fetch("/api/verify/content-witness", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                recordId: best.id,
                candidateWitness: candidate.witness,
              }),
            }),
            fetch(
              `/api/records/${encodeURIComponent(best.id)}/content-witness`,
              { cache: "no-store" }
            ),
          ]);

          const witnessData = await witnessResponse.json();
          const witnessMeta = await witnessMetaResponse.json();

          if (witnessResponse.ok && witnessData.available) {
            setWitnessResult(witnessData);
          }

          if (
            witnessMetaResponse.ok &&
            witnessMeta.enabled &&
            witnessMeta.validRegistrySignature &&
            witnessMeta.mode === "public_text" &&
            typeof witnessMeta.publicText === "string" &&
            witnessMeta.publicText.trim()
          ) {
            const diff = diffDocumentText(
              witnessMeta.publicText,
              candidate.extractedText
            );
            setPublicTextAnalysis(classifyPublicTextAnalysis(diff));
          }
        } catch {
          // Optional explanatory integrity layers must never invalidate the
          // underlying provenance verification result.
        }
      }
    } catch (e: any) {
      setError(e.message || "Unable to verify file.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyManifest() {
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: manifestText,
      });
      setManifestResult(await r.json());
    } catch {
      setManifestResult({
        validSchema: false,
        error: "Invalid manifest.",
      });
    }
  }

  const best = fileResult?.records?.[0];

  const bestTrusted = Boolean(
    best &&
      best.status === "active" &&
      best.validRegistrySignature &&
      (best.creatorSignatureValid || best.institutionSignatureValid)
  );

  const verificationClass = best?.verificationClass || "";
  const exact = verificationClass === "exact_original";

  const meaningfulTextChangeCount =
    (publicTextAnalysis?.textChanges.length || 0) +
    (publicTextAnalysis?.materialValueChanges.length || 0);

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS VERIFY</p>
        <h1>Check the file in front of you.</h1>
        <p>
          Upload only the document you received. HPS first checks cryptographic
          identity and resilient provenance. If the registered owner or issuer
          enabled a Content Integrity Witness, HPS can also explain registered
          value changes and, in public-text mode, word-level insertions,
          deletions and replacements without asking the verifier for the
          original file.
        </p>
      </header>

      <section className="verifyBox">
        <div className="fileDrop">
          <p className="micro">ONE-FILE VERIFICATION</p>
          <h2>Upload the document you want to check.</h2>
          <input type="file" onChange={e => verifyFile(e.target.files?.[0])} />

          {busy && (
            <p className="muted">
              Checking exact identity, resilient provenance and available
              integrity witnesses…
            </p>
          )}

          <p className="muted">
            Candidate file bytes and complete candidate text stay in your
            browser. HPS receives the regular file fingerprint and, where
            available, selected critical-value witness data. If the registered
            owner explicitly enabled public-text integrity, the signed
            registered text is returned to your browser and compared locally.
          </p>
        </div>

        {error && <div className="errorBox">{error}</div>}

        {fileResult && (
          <div className="result">
            {best ? (
              <>
                <a
                  className={
                    bestTrusted
                      ? "hpsCompactMark"
                      : "hpsCompactMark hpsCompactMarkWarning"
                  }
                  href={`/records/${best.id}`}
                >
                  <span className="hpsCompactLogo">HPS</span>
                  <span className="hpsCompactCheck">
                    {bestTrusted ? "✓" : "!"}
                  </span>
                  <span className="hpsCompactText">
                    {classLabel[verificationClass] ||
                      "PROVENANCE RELATIONSHIP"}
                  </span>
                  <code>{shortCode(best.id)}</code>
                </a>

                <div className="verificationGrid">
                  <div>
                    <span>Asset identity</span>
                    <strong className={exact ? "positive" : ""}>
                      {exact ? "✓ Exact SHA-256" : "Different bytes"}
                    </strong>
                  </div>

                  <div>
                    <span>Relationship</span>
                    <strong>
                      {classLabel[verificationClass] || verificationClass}
                    </strong>
                  </div>

                  <div>
                    <span>Relationship confidence</span>
                    <strong>
                      {typeof best.confidenceScore === "number"
                        ? `${best.confidenceScore}/100`
                        : best.assurance || "unknown"}
                    </strong>
                  </div>

                  <div>
                    <span>Text integrity</span>
                    <strong
                      className={
                        best.comparison?.canonicalTextMatch === false
                          ? "negative"
                          : best.comparison?.canonicalTextMatch === true
                            ? "positive"
                            : ""
                      }
                    >
                      {best.comparison?.canonicalTextMatch === true
                        ? "✓ Identical"
                        : best.comparison?.canonicalTextMatch === false
                          ? "⚠ Changed"
                          : "Unavailable"}
                    </strong>
                  </div>

                  <div>
                    <span>Registry signature</span>
                    <strong
                      className={
                        best.validRegistrySignature ? "positive" : "negative"
                      }
                    >
                      {best.validRegistrySignature ? "✓ Valid" : "✕ Invalid"}
                    </strong>
                  </div>

                  <div>
                    <span>Issuer/creator signature</span>
                    <strong
                      className={
                        best.creatorSignatureValid ||
                        best.institutionSignatureValid
                          ? "positive"
                          : "negative"
                      }
                    >
                      {best.creatorSignatureValid ||
                      best.institutionSignatureValid
                        ? "✓ Valid"
                        : "✕ Not independently valid"}
                    </strong>
                  </div>

                  <div>
                    <span>Status</span>
                    <strong>{best.status}</strong>
                  </div>
                </div>

                {best.comparison?.reasons?.length > 0 && (
                  <div className="statusBox">
                    {best.comparison.reasons
                      .slice(0, 4)
                      .map((reason: string, i: number) => (
                        <p key={i}>{reason}</p>
                      ))}
                  </div>
                )}

                {publicTextAnalysis && meaningfulTextChangeCount > 0 && (
                  <div className="errorBox" style={{ marginTop: 18 }}>
                    <p className="micro">
                      REGISTERED PUBLIC TEXT INTEGRITY WITNESS
                    </p>
                    <h2>
                      ⚠ {meaningfulTextChangeCount === 1
                        ? "Textual content change detected"
                        : "Textual content changes detected"}
                    </h2>
                    <p>
                      HPS compared this candidate locally with the signed
                      registered public-text witness. The verifier did not need
                      to upload the original file.
                    </p>

                    <div className="verificationGrid" style={{ marginTop: 14 }}>
                      <div>
                        <span>Word/text changes</span>
                        <strong>
                          {publicTextAnalysis.textChanges.length}
                        </strong>
                      </div>
                      <div>
                        <span>Material value changes</span>
                        <strong className={
                          publicTextAnalysis.materialValueChanges.length
                            ? "negative"
                            : ""
                        }>
                          {publicTextAnalysis.materialValueChanges.length}
                        </strong>
                      </div>
                      <div>
                        <span>Presentation differences</span>
                        <strong>
                          {publicTextAnalysis.presentationChanges.length}
                        </strong>
                      </div>
                    </div>

                    {publicTextAnalysis.materialValueChanges.length === 0 && (
                      <p className="muted" style={{ marginTop: 12 }}>
                        No critical numerical, date, percentage or currency
                        changes were detected.
                      </p>
                    )}

                    <div className="statusBox" style={{ marginTop: 14 }}>
                      {[
                        ...publicTextAnalysis.materialValueChanges,
                        ...publicTextAnalysis.textChanges,
                      ]
                        .slice(0, 30)
                        .map((change, i) => (
                          <div
                            key={i}
                            style={{
                              padding: "9px 0",
                              borderBottom:
                                i ===
                                Math.min(
                                  30,
                                  meaningfulTextChangeCount
                                ) -
                                  1
                                  ? "none"
                                  : "1px solid rgba(255,255,255,.08)",
                            }}
                          >
                            <p style={{ margin: 0 }}>
                              <strong>
                                {change.material ? "⚠ " : ""}
                                {change.kind.toUpperCase()} ·{" "}
                                {displayChangeCategory(change)}
                              </strong>
                            </p>

                            {change.kind === "replaced" && (
                              <p style={{ margin: "5px 0 0" }}>
                                <code>{change.originalText || "∅"}</code>
                                {" → "}
                                <code>{change.candidateText || "∅"}</code>
                              </p>
                            )}

                            {change.kind === "deleted" && (
                              <p style={{ margin: "5px 0 0" }}>
                                Deleted:{" "}
                                <code>{change.originalText}</code>
                              </p>
                            )}

                            {change.kind === "inserted" && (
                              <p style={{ margin: "5px 0 0" }}>
                                Inserted:{" "}
                                <code>{change.candidateText}</code>
                              </p>
                            )}

                            {(change.contextBefore ||
                              change.contextAfter) && (
                              <p className="muted" style={{ margin: "5px 0 0" }}>
                                Context: …{change.contextBefore}
                                {change.contextBefore ? " " : ""}
                                <strong>[change]</strong>
                                {change.contextAfter ? " " : ""}
                                {change.contextAfter}…
                              </p>
                            )}
                          </div>
                        ))}
                    </div>

                    {publicTextAnalysis.presentationChanges.length > 0 && (
                      <details className="advancedVerify" style={{ marginTop: 14 }}>
                        <summary>
                          Show {publicTextAnalysis.presentationChanges.length} presentation /
                          extraction difference
                          {publicTextAnalysis.presentationChanges.length === 1 ? "" : "s"}
                        </summary>
                        <div className="statusBox" style={{ marginTop: 10 }}>
                          {publicTextAnalysis.presentationChanges
                            .slice(0, 30)
                            .map((change, i) => (
                              <p key={i}>
                                <strong>{change.kind.toUpperCase()}</strong>
                                {" · "}
                                <code>
                                  {change.originalText ||
                                    change.candidateText ||
                                    "(formatting)"}
                                </code>
                              </p>
                            ))}
                        </div>
                      </details>
                    )}

                    <p className="muted">
                      Presentation-only extraction differences are excluded from
                      material-change counts and collapsed by default. OCR-derived
                      comparisons may still contain OCR errors.
                    </p>
                  </div>
                )}

                {publicTextAnalysis &&
                  meaningfulTextChangeCount === 0 &&
                  !publicTextAnalysis.diff.exactTextMatch && (
                    <div className="notice" style={{ marginTop: 18 }}>
                      <strong>
                        Only presentation/extraction differences were found.
                      </strong>
                      <p>
                        The public-text witness comparison found no meaningful
                        word or registered value change after HPS filtering.
                      </p>
                    </div>
                  )}

                {publicTextAnalysis?.diff.exactTextMatch && (
                  <div className="successPanel" style={{ marginTop: 18 }}>
                    <p className="micro">
                      REGISTERED PUBLIC TEXT INTEGRITY WITNESS
                    </p>
                    <h3>✓ Recovered text matches the registered witness</h3>
                    <p>
                      No token-level textual change was found after HPS
                      normalization.
                    </p>
                  </div>
                )}

                {!publicTextAnalysis &&
                  witnessResult?.status ===
                    "material_change_detected" && (
                    <div className="errorBox" style={{ marginTop: 18 }}>
                      <p className="micro">
                        REGISTERED CONTENT INTEGRITY WITNESS
                      </p>
                      <h2>⚠ Material value change detected</h2>

                      {witnessResult.inferredSubstitutionMatches > 0 && (
                        <div className="notice" style={{ marginTop: 12 }}>
                          <strong>
                            High-confidence substitution pairing
                          </strong>
                          <p>
                            HPS paired{" "}
                            {witnessResult.inferredSubstitutionMatches} unmatched
                            registered value
                            {witnessResult.inferredSubstitutionMatches === 1
                              ? ""
                              : "s"}{" "}
                            with the corresponding candidate value after nearly
                            all other registered critical values matched. The
                            pairing uses value type, document position, available
                            field-label similarity and the one-to-one unmatched
                            pattern.
                          </p>
                        </div>
                      )}

                      {witnessResult.labelFallbackMatches > 0 && (
                        <p className="muted" style={{ marginTop: 10 }}>
                          HPS recovered {witnessResult.labelFallbackMatches} value
                          match{witnessResult.labelFallbackMatches === 1 ? "" : "es"}
                          using the same registered field label after
                          cross-format extraction changed the surrounding anchor.
                        </p>
                      )}

                      <div className="statusBox" style={{ marginTop: 12 }}>
                        {witnessResult.changes.map(
                          (change: any, i: number) => (
                            <div key={i} style={{ padding: "8px 0" }}>
                              <p style={{ margin: 0 }}>
                                <strong>
                                  {String(change.category).toUpperCase()}
                                </strong>
                                {change.label ? ` · ${change.label}` : ""}
                              </p>
                              <p style={{ margin: "5px 0 0" }}>
                                <code>{change.originalValue}</code>
                                {" → "}
                                <code>{change.candidateValue}</code>
                              </p>

                              {change.matchBasis ===
                                "inferred_substitution" && (
                                <p
                                  className="muted"
                                  style={{ margin: "5px 0 0" }}
                                >
                                  Paired as a high-confidence substitution
                                  {typeof change.pairConfidence === "number"
                                    ? ` · ${change.pairConfidence}/100 pairing confidence`
                                    : ""}
                                  .
                                </p>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {!publicTextAnalysis &&
                  witnessResult?.status ===
                    "critical_values_consistent" && (
                    <div className="successPanel" style={{ marginTop: 18 }}>
                      <p className="micro">
                        REGISTERED CONTENT INTEGRITY WITNESS
                      </p>
                      <h3>
                        ✓ Registered critical values accounted for
                      </h3>
                      <p>
                        HPS accounted for all {witnessResult.registeredEntries}
                        registered critical-value entries and found no changed
                        value.
                      </p>
                    </div>
                  )}

                {!publicTextAnalysis &&
                  witnessResult?.status === "inconclusive" && (
                    <div className="notice" style={{ marginTop: 18 }}>
                      <p className="micro">
                        REGISTERED CONTENT INTEGRITY WITNESS
                      </p>
                      <h3>⚠ Critical-value comparison inconclusive</h3>
                      <p>
                        HPS matched {witnessResult.matchedEntries} of{" "}
                        {witnessResult.registeredEntries} registered
                        critical-value entries, but could not account for all of
                        them. HPS therefore will not say that the critical values
                        are unchanged.
                      </p>

                      {(witnessResult.missingRegisteredCount > 0 ||
                        witnessResult.extraCandidateCount > 0) && (
                        <div className="statusBox" style={{ marginTop: 12 }}>
                          {witnessResult.missingRegisteredCount > 0 && (
                            <p>
                              <strong>Registered values not matched:</strong>{" "}
                              {witnessResult.missingRegisteredCount}
                            </p>
                          )}
                          {witnessResult.extraCandidateCount > 0 && (
                            <p>
                              <strong>Candidate values not explained:</strong>{" "}
                              {witnessResult.extraCandidateCount}
                            </p>
                          )}
                        </div>
                      )}

                      <p className="muted">
                        This can happen when a conversion changes table order,
                        surrounding labels or extraction structure. It is a
                        reason for caution, not proof of tampering.
                      </p>
                    </div>
                  )}

                <div className="actions">
                  <Link
                    className="button primary"
                    href={`/records/${best.id}`}
                  >
                    Open provenance record
                  </Link>

                  <Link
                    className="button darkButton"
                    href="/verify/derivative"
                  >
                    Advanced two-file forensic comparison
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2>No HPS relationship found.</h2>
                <p>
                  HPS found no exact asset or sufficiently strong registered,
                  textual, structural or visual relationship. This does not
                  prove the file is false; it means HPS cannot connect it to a
                  registered asset with the available evidence.
                </p>
              </>
            )}

            {fileResult.fingerprint?.warnings?.length > 0 && (
              <details>
                <summary>Fingerprint notes</summary>
                <div className="statusBox">
                  {fileResult.fingerprint.warnings.map(
                    (warning: string, i: number) => (
                      <p key={i}>{warning}</p>
                    )
                  )}
                </div>
              </details>
            )}

            <details>
              <summary>Technical data</summary>
              <pre>
                {JSON.stringify(
                  {
                    verification: fileResult,
                    contentWitness: witnessResult,
                    publicTextAnalysis,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
        )}

        <details className="advancedVerify">
          <summary>Advanced · verify a signed manifest directly</summary>
          <textarea
            value={manifestText}
            onChange={e => setManifestText(e.target.value)}
            placeholder="Paste signed HPS manifest JSON…"
          />
          <button
            className="button darkButton"
            disabled={!manifestText.trim()}
            onClick={verifyManifest}
          >
            Verify manifest
          </button>
          {manifestResult && (
            <pre className="codeBox">
              {JSON.stringify(manifestResult, null, 2)}
            </pre>
          )}
        </details>
      </section>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="loading">Loading verifier…</div>}>
      <VerifyContent />
    </Suspense>
  );
}
