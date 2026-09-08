"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fingerprintFile, type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";
import {
  extractLocalDocumentText,
  type HpsLocalTextExtraction,
} from "@/lib/hps/local-text-extract";
import {
  diffDocumentText,
  type HpsTextDiffResult,
} from "@/lib/hps/text-diff";

const labels: Record<string, { title: string; tone: string }> = {
  exact_original: { title: "EXACT ORIGINAL", tone: "positive" },
  registered_derivative: { title: "REGISTERED DERIVATIVE", tone: "positive" },
  verified_derivative: { title: "VERIFIED DERIVATIVE", tone: "positive" },
  cross_format_match: { title: "STRONG CROSS-FORMAT MATCH", tone: "positive" },
  derivative_candidate: { title: "DERIVATIVE CANDIDATE", tone: "warning" },
  modified_derivative: { title: "MODIFIED / RELATED DERIVATIVE", tone: "warning" },
  revoked: { title: "REVOKED PROVENANCE", tone: "negative" },
};

const transformationLabels: Record<string, string> = {
  digitization: "Digitization · physical/scanned copy",
  transcription: "Transcription · content moved into another editable format",
  format_conversion: "Format conversion",
  compression: "Compression",
  optimization: "Optimization",
  metadata_stripped: "Metadata stripped",
  transmission: "Transmission / messaging copy",
  resize: "Resize",
  other: "Other",
};

type LocalChangeAnalysis = {
  diff: HpsTextDiffResult;
  original: HpsLocalTextExtraction;
  candidate: HpsLocalTextExtraction;
};

function changeTitle(kind: string) {
  if (kind === "replaced") return "REPLACED";
  if (kind === "deleted") return "DELETED";
  return "INSERTED";
}

export default function ResilientVerifyPage() {
  const [busy, setBusy] = useState(false);
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [fingerprint, setFingerprint] = useState<HpsAssetFingerprintV1 | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [transformationType, setTransformationType] = useState("digitization");
  const [note, setNote] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");

  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeAnalysis, setChangeAnalysis] = useState<LocalChangeAnalysis | null>(null);

  async function verify(file?: File) {
    if (!file) return;
    setCandidateFile(file);
    setBusy(true);
    setError("");
    setResult(null);
    setFingerprint(null);
    setRegisterMessage("");
    setChangeAnalysis(null);
    setChangeError("");

    try {
      const fp = await fingerprintFile(file);
      setFingerprint(fp);
      const response = await fetch("/api/verify/asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetHash: fp.exactSha256, fingerprint: fp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to verify file.");
      setResult(data);

      const best = data?.records?.[0];
      if (best?.verificationClass === "cross_format_match") {
        const source = fp.textSource;
        setTransformationType(source === "ocr" || source === "mixed" ? "digitization" : "transcription");
      }
    } catch (e: any) {
      setError(e.message || "Unable to verify file.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeExactChanges() {
    if (!candidateFile || !referenceFile) {
      setChangeError("Upload the candidate above and select the known original/reference file first.");
      return;
    }

    setChangeBusy(true);
    setChangeError("");
    setChangeAnalysis(null);

    try {
      // Deliberately sequential: image-only PDFs can start a local OCR worker.
      const original = await extractLocalDocumentText(referenceFile);
      const candidate = await extractLocalDocumentText(candidateFile);

      if (!original.text.trim()) {
        throw new Error("HPS could not recover comparable text from the original/reference file.");
      }
      if (!candidate.text.trim()) {
        throw new Error("HPS could not recover comparable text from the candidate file.");
      }

      setChangeAnalysis({
        original,
        candidate,
        diff: diffDocumentText(original.text, candidate.text),
      });
    } catch (e: any) {
      setChangeError(e.message || "Unable to compare document text locally.");
    } finally {
      setChangeBusy(false);
    }
  }

  const best = result?.records?.[0];
  const label = labels[best?.verificationClass] || null;
  const canRegister = Boolean(
    fingerprint &&
    best &&
    ["verified_derivative", "cross_format_match"].includes(best.verificationClass) &&
    best.status !== "revoked"
  );

  async function registerDerivative() {
    if (!fingerprint || !best) return;
    setRegistering(true);
    setRegisterMessage("");
    try {
      const response = await fetch(`/api/records/${encodeURIComponent(best.id)}/derivatives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint, transformationType, note: note || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to register derivative relationship.");
      setRegisterMessage(`✓ Registered as ${transformationLabels[transformationType] || transformationType}. Future verification of this exact file will resolve directly to ${best.id}.`);
    } catch (e: any) {
      setRegisterMessage(e.message || "Unable to register derivative relationship.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS VERIFY · RESILIENT DOCUMENT PROVENANCE</p>
        <h1>Verify provenance — then inspect exactly what changed.</h1>
        <p>
          HPS checks exact SHA-256 first. If the bytes differ, it can use embedded text,
          browser OCR, canonical content, document structure and supporting visual signals
          to detect likely transformations without calling them identical files. When you
          also have a known original, HPS can compare both files locally and show exact
          insertions, deletions and replacements.
        </p>
      </header>

      <section className="verifyBox">
        <div className="fileDrop">
          <p className="micro">LOCAL FINGERPRINTING</p>
          <h2>Upload the file in front of you.</h2>
          <input type="file" onChange={e => verify(e.target.files?.[0])} />
          {busy && <p className="muted">Building SHA-256, OCR/text, structural and visual fingerprints… Image-only scans can take longer.</p>}
          <p className="muted">The file is processed in your browser. HPS receives fingerprints, not the uploaded file bytes.</p>
        </div>

        {error && <div className="errorBox">{error}</div>}

        {fingerprint && (
          <div className="verificationGrid" style={{ marginTop: 18 }}>
            <div><span>Text source</span><strong>{fingerprint.textSource || "none"}</strong></div>
            <div><span>OCR</span><strong>{fingerprint.ocr?.used ? `Used · ${fingerprint.ocr.averageConfidence ?? "?"}% confidence` : "Not required / unavailable"}</strong></div>
            <div><span>Document structure</span><strong>{fingerprint.structureSimHash64 ? "✓ Fingerprinted" : "Unavailable"}</strong></div>
            <div><span>Visual marks</span><strong>{fingerprint.markSignals ? "Supporting signals captured" : "Unavailable"}</strong></div>
          </div>
        )}

        {fingerprint?.warnings?.length ? (
          <details className="advancedVerify">
            <summary>Fingerprint notes</summary>
            <div className="statusBox">
              {fingerprint.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
            </div>
          </details>
        ) : null}

        {result && (
          <div className="result">
            {best && label ? (
              <>
                <div className={label.tone === "negative" ? "revocationBanner" : "successPanel"}>
                  <p className="micro">HPS DOCUMENT RELATIONSHIP RESULT</p>
                  <h2>{label.title}</h2>
                  <p>{best.title} · {best.creatorName}</p>
                  {typeof best.confidenceScore === "number" && (
                    <p><strong>{best.confidenceScore}/100</strong> relationship confidence · {String(best.confidenceBand || "").replaceAll("_", " ")}</p>
                  )}
                </div>

                <div className="verificationGrid">
                  <div><span>Exact SHA-256</span><strong>{best.comparison?.exactHashMatch ? "✓ Exact" : "Different bytes"}</strong></div>
                  <div>
                    <span>Text integrity</span>
                    <strong className={best.comparison?.canonicalTextMatch === false ? "negative" : best.comparison?.canonicalTextMatch === true ? "positive" : ""}>
                      {best.comparison?.canonicalTextMatch === true ? "✓ Identical" : best.comparison?.canonicalTextMatch === false ? "⚠ Changed" : "Unavailable"}
                    </strong>
                  </div>
                  <div><span>Cross-format content</span><strong>{best.comparison?.contentCanonicalMatch === true ? "✓ Canonical match" : typeof best.comparison?.contentSimilarity === "number" ? `${(best.comparison.contentSimilarity * 100).toFixed(1)}% similar` : "Unavailable"}</strong></div>
                  <div><span>Document structure</span><strong>{typeof best.comparison?.structureSimilarity === "number" ? `${(best.comparison.structureSimilarity * 100).toFixed(1)}%` : "Unavailable"}</strong></div>
                  <div><span>Visual similarity</span><strong>{typeof best.comparison?.visualSimilarity === "number" ? `${(best.comparison.visualSimilarity * 100).toFixed(1)}%` : "Unavailable"}</strong></div>
                  <div><span>OCR involved</span><strong>{best.comparison?.ocrInvolved ? "Yes" : "No"}</strong></div>
                  <div><span>Signature signal</span><strong>{typeof best.comparison?.signatureSignalSimilarity === "number" ? `${(best.comparison.signatureSignalSimilarity * 100).toFixed(1)}% signal similarity` : "Unavailable"}</strong></div>
                  <div><span>Stamp/seal signal</span><strong>{typeof best.comparison?.stampSignalSimilarity === "number" ? `${(best.comparison.stampSignalSimilarity * 100).toFixed(1)}% signal similarity` : "Unavailable"}</strong></div>
                  <div><span>Assurance</span><strong>{best.assurance || "unknown"}</strong></div>
                  <div><span>Registry signature</span><strong className={best.validRegistrySignature ? "positive" : "negative"}>{best.validRegistrySignature ? "✓ Valid" : "✕ Invalid"}</strong></div>
                  <div><span>Record status</span><strong>{best.status}</strong></div>
                  <div><span>Format relationship</span><strong>{best.comparison?.crossFormat ? "Cross-format" : "Same format / unknown"}</strong></div>
                </div>

                {best.comparison?.reasons?.length > 0 && (
                  <div className="statusBox">
                    {best.comparison.reasons.map((reason: string, i: number) => <p key={i}>{reason}</p>)}
                  </div>
                )}

                <div className="accountCard" style={{ marginTop: 20 }}>
                  <p className="micro">EXACT LOCAL CHANGE ANALYSIS</p>
                  <h3>See the words, numbers or dates that changed.</h3>
                  <p className="muted">
                    Registry fingerprints can prove that content differs, but a cryptographic hash does not contain the deleted word or the old number. If you have the known original/reference file, HPS can compare it with the candidate entirely in this browser and show the exact recovered-text edits.
                  </p>

                  <div className="field" style={{ marginTop: 14 }}>
                    <label>Known original / reference file</label>
                    <input
                      type="file"
                      onChange={e => {
                        setReferenceFile(e.target.files?.[0] || null);
                        setChangeAnalysis(null);
                        setChangeError("");
                      }}
                    />
                  </div>

                  <button
                    className="button primary"
                    style={{ marginTop: 12 }}
                    disabled={!candidateFile || !referenceFile || changeBusy}
                    onClick={analyzeExactChanges}
                  >
                    {changeBusy ? "Comparing locally…" : "Analyze exact text changes locally"}
                  </button>

                  {changeError && <div className="errorBox" style={{ marginTop: 14 }}>{changeError}</div>}

                  {changeAnalysis && (
                    <div style={{ marginTop: 18 }}>
                      <div className="verificationGrid">
                        <div><span>Text result</span><strong className={changeAnalysis.diff.exactTextMatch ? "positive" : "negative"}>{changeAnalysis.diff.exactTextMatch ? "✓ No recovered-text changes" : "⚠ Changes detected"}</strong></div>
                        <div><span>Replacements</span><strong>{changeAnalysis.diff.replacementGroups}</strong></div>
                        <div><span>Deletions</span><strong>{changeAnalysis.diff.deletionGroups}</strong></div>
                        <div><span>Insertions</span><strong>{changeAnalysis.diff.insertionGroups}</strong></div>
                        <div><span>Critical-value changes</span><strong className={changeAnalysis.diff.materialChangeGroups ? "negative" : ""}>{changeAnalysis.diff.materialChangeGroups}</strong></div>
                        <div><span>Text extraction</span><strong>{changeAnalysis.original.textSource} → {changeAnalysis.candidate.textSource}</strong></div>
                      </div>

                      {changeAnalysis.diff.exactTextMatch ? (
                        <div className="successPanel" style={{ marginTop: 16 }}>
                          <h3>✓ Recovered text is equivalent after HPS normalization.</h3>
                          <p>No token-level insertion, deletion or replacement was found in the locally recovered text.</p>
                        </div>
                      ) : (
                        <div className="statusBox" style={{ marginTop: 16 }}>
                          {changeAnalysis.diff.changes.map((change, i) => (
                            <div key={i} style={{ padding: "12px 0", borderBottom: i === changeAnalysis.diff.changes.length - 1 ? "none" : "1px solid rgba(255,255,255,.08)" }}>
                              <p style={{ margin: "0 0 7px" }}>
                                <strong>{change.material ? "⚠ " : ""}{changeTitle(change.kind)} · {change.category.toUpperCase()}</strong>
                              </p>

                              {change.kind === "replaced" && (
                                <p style={{ margin: "0 0 7px" }}><code>{change.originalText || "∅"}</code> → <code>{change.candidateText || "∅"}</code></p>
                              )}
                              {change.kind === "deleted" && (
                                <p style={{ margin: "0 0 7px" }}>Deleted: <code>{change.originalText}</code></p>
                              )}
                              {change.kind === "inserted" && (
                                <p style={{ margin: "0 0 7px" }}>Inserted: <code>{change.candidateText}</code></p>
                              )}

                              {(change.contextBefore || change.contextAfter) && (
                                <p className="muted" style={{ margin: 0 }}>
                                  Context: …{change.contextBefore}{change.contextBefore ? " " : ""}<strong>[change]</strong>{change.contextAfter ? " " : ""}{change.contextAfter}…
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {changeAnalysis.diff.truncated && (
                        <div className="notice" style={{ marginTop: 14 }}>
                          <strong>Large change region.</strong>
                          <p>The detailed change list was bounded for browser performance. The summary still indicates that substantial content changed.</p>
                        </div>
                      )}

                      {[...changeAnalysis.original.warnings, ...changeAnalysis.candidate.warnings].length > 0 && (
                        <details className="advancedVerify" style={{ marginTop: 14 }}>
                          <summary>Local extraction notes</summary>
                          <div className="statusBox">
                            {[...changeAnalysis.original.warnings, ...changeAnalysis.candidate.warnings].map((warning, i) => <p key={i}>{warning}</p>)}
                          </div>
                        </details>
                      )}

                      <div className="notice" style={{ marginTop: 14 }}>
                        <strong>Local diff is content analysis, not provenance proof.</strong>
                        <p>
                          The two file texts are compared in your browser and are not posted to the HPS verification API. The signed HPS record and cryptographic signatures establish provenance; this local comparison explains what changed between the files you selected. OCR-derived differences can include OCR errors.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="notice" style={{ marginTop: 18 }}>
                  <strong>Signature and stamp signals are supporting evidence only.</strong>
                  <p>HPS does not authenticate handwriting, biometric identity, a seal, or an institution merely from visual similarity. Exact SHA-256 and signed provenance remain the strongest evidence.</p>
                </div>

                {canRegister && (
                  <div className="accountCard" style={{ marginTop: 20 }}>
                    <p className="micro">EXPLICIT PROVENANCE RELATIONSHIP</p>
                    <h3>Register this transformed copy</h3>
                    <p className="muted">
                      If you are the record owner or an authorized issuer, register the exact uploaded file as a known derivative. This creates a signed relationship without pretending the files are identical.
                    </p>

                    <div className="formGrid">
                      <div className="field">
                        <label>Transformation</label>
                        <select value={transformationType} onChange={e => setTransformationType(e.target.value)}>
                          {Object.entries(transformationLabels).map(([value, title]) => (
                            <option key={value} value={value}>{title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label>Optional note</label>
                        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. scanned from signed paper original" />
                      </div>
                    </div>

                    <button className="button primary" disabled={registering} onClick={registerDerivative}>
                      {registering ? "Registering relationship…" : "Register transformed copy"}
                    </button>

                    {registerMessage && <p className="authMessage">{registerMessage}</p>}
                  </div>
                )}

                <div className="actions">
                  <Link className="button primary" href={`/records/${best.id}`}>Open provenance record</Link>
                  <Link className="button darkButton" href="/verify">Exact / manifest verifier</Link>
                </div>
              </>
            ) : (
              <>
                <h2>No HPS relationship established.</h2>
                <p>HPS found no exact original, registered derivative, strong cross-format correspondence, or sufficiently strong transformation relationship. This does not prove the file is false; it means HPS cannot connect it to a registered asset with the available evidence.</p>
              </>
            )}

            <details>
              <summary>Technical result</summary>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}
