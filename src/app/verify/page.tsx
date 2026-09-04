"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fingerprintFile } from "@/lib/hps/fingerprint-client";

const shortCode = (id?: string) => id?.split("-").pop() || "";

const classLabel: Record<string, string> = {
  exact_original: "EXACT ASSET",
  registered_derivative: "REGISTERED DERIVATIVE",
  verified_derivative: "VERIFIED DERIVATIVE",
  cross_format_match: "CROSS-FORMAT MATCH",
  derivative_candidate: "POSSIBLE DERIVATIVE",
  modified_derivative: "RELATED / MODIFIED",
  revoked: "REVOKED"
};

function VerifyContent() {
  const [fileResult, setFileResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [manifestText, setManifestText] = useState("");
  const [manifestResult, setManifestResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function verifyFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setFileResult(null);
    try {
      const fingerprint = await fingerprintFile(file);
      const r = await fetch("/api/verify/asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetHash: fingerprint.exactSha256, fingerprint })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to verify file.");
      setFileResult({ ...data, fileName: file.name, fingerprint });
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
        body: manifestText
      });
      setManifestResult(await r.json());
    } catch {
      setManifestResult({ validSchema: false, error: "Invalid manifest." });
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

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS VERIFY</p>
        <h1>Check the file in front of you.</h1>
        <p>
          HPS checks exact SHA-256 first. For scans and reformatted documents it can
          also use browser OCR, canonical content, document structure and supporting
          visual fingerprints to identify likely provenance relationships.
        </p>
      </header>

      <section className="verifyBox">
        <div className="fileDrop">
          <p className="micro">LOCAL DOCUMENT FINGERPRINTING</p>
          <h2>Upload the file.</h2>
          <input type="file" onChange={e => verifyFile(e.target.files?.[0])} />
          {busy && <p className="muted">Checking exact identity and resilient document provenance… Scanned documents may take longer while OCR runs locally.</p>}
          <p className="muted">Your file bytes are processed in the browser; HPS receives fingerprints rather than the uploaded file itself.</p>
        </div>

        {error && <div className="errorBox">{error}</div>}

        {fileResult && (
          <div className="result">
            {best ? (
              <>
                <a
                  className={bestTrusted ? "hpsCompactMark" : "hpsCompactMark hpsCompactMarkWarning"}
                  href={`/records/${best.id}`}
                >
                  <span className="hpsCompactLogo">HPS</span>
                  <span className="hpsCompactCheck">{bestTrusted ? "✓" : "!"}</span>
                  <span className="hpsCompactText">
                    {classLabel[verificationClass] || "PROVENANCE RELATIONSHIP"}
                  </span>
                  <code>{shortCode(best.id)}</code>
                </a>

                <div className="verificationGrid">
                  <div>
                    <span>Asset identity</span>
                    <strong className={exact ? "positive" : ""}>{exact ? "✓ Exact SHA-256" : "Different bytes"}</strong>
                  </div>
                  <div>
                    <span>Relationship</span>
                    <strong>{classLabel[verificationClass] || verificationClass}</strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>{typeof best.confidenceScore === "number" ? `${best.confidenceScore}/100` : best.assurance || "unknown"}</strong>
                  </div>
                  <div>
                    <span>Registry signature</span>
                    <strong className={best.validRegistrySignature ? "positive" : "negative"}>{best.validRegistrySignature ? "✓ Valid" : "✕ Invalid"}</strong>
                  </div>
                  <div>
                    <span>Issuer/creator signature</span>
                    <strong className={(best.creatorSignatureValid || best.institutionSignatureValid) ? "positive" : "negative"}>
                      {best.creatorSignatureValid || best.institutionSignatureValid ? "✓ Valid" : "✕ Not independently valid"}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{best.status}</strong>
                  </div>
                </div>

                {best.comparison?.reasons?.length > 0 && (
                  <div className="statusBox">
                    {best.comparison.reasons.slice(0, 4).map((reason: string, i: number) => <p key={i}>{reason}</p>)}
                  </div>
                )}

                <div className="actions">
                  <Link className="button primary" href={`/records/${best.id}`}>Open provenance record</Link>
                  <Link className="button darkButton" href="/verify/derivative">Detailed scan / cross-format analysis</Link>
                </div>
              </>
            ) : (
              <>
                <h2>No HPS relationship found.</h2>
                <p>
                  HPS found no exact asset or sufficiently strong registered, textual,
                  structural or visual relationship. This does not prove the file is false;
                  it means HPS cannot connect it to a registered asset with the available evidence.
                </p>
              </>
            )}

            {fileResult.fingerprint?.warnings?.length > 0 && (
              <details>
                <summary>Fingerprint notes</summary>
                <div className="statusBox">
                  {fileResult.fingerprint.warnings.map((warning: string, i: number) => <p key={i}>{warning}</p>)}
                </div>
              </details>
            )}

            <details>
              <summary>Technical data</summary>
              <pre>{JSON.stringify(fileResult, null, 2)}</pre>
            </details>
          </div>
        )}

        <details className="advancedVerify">
          <summary>Advanced · verify a signed manifest directly</summary>
          <textarea value={manifestText} onChange={e => setManifestText(e.target.value)} placeholder="Paste signed HPS manifest JSON…" />
          <button className="button darkButton" disabled={!manifestText.trim()} onClick={verifyManifest}>Verify manifest</button>
          {manifestResult && <pre className="codeBox">{JSON.stringify(manifestResult, null, 2)}</pre>}
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
