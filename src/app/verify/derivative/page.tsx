"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fingerprintFile, type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";

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

export default function ResilientVerifyPage() {
  const [busy, setBusy] = useState(false);
  const [fingerprint, setFingerprint] = useState<HpsAssetFingerprintV1 | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [transformationType, setTransformationType] = useState("digitization");
  const [note, setNote] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");

  async function verify(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    setFingerprint(null);
    setRegisterMessage("");

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
        <h1>Verify originals, scans and cross-format copies.</h1>
        <p>
          HPS checks exact SHA-256 first. If the bytes differ, it can use embedded text,
          browser OCR, canonical content, document structure and supporting visual signals
          to detect likely transformations without calling them identical files.
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
                  <div><span>Strict canonical text</span><strong>{best.comparison?.canonicalTextMatch === true ? "✓ Identical" : best.comparison?.canonicalTextMatch === false ? "Different" : "Unavailable"}</strong></div>
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
