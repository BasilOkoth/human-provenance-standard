"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fingerprintFile, type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";

const labels: Record<string, { title: string; tone: string }> = {
  exact_original: { title: "EXACT ORIGINAL", tone: "positive" },
  registered_derivative: { title: "REGISTERED DERIVATIVE", tone: "positive" },
  verified_derivative: { title: "VERIFIED DERIVATIVE", tone: "positive" },
  derivative_candidate: { title: "DERIVATIVE CANDIDATE", tone: "warning" },
  modified_derivative: { title: "MODIFIED DERIVATIVE", tone: "warning" },
  revoked: { title: "REVOKED PROVENANCE", tone: "negative" },
};

export default function CompressionAwareVerifyPage() {
  const [busy, setBusy] = useState(false);
  const [fingerprint, setFingerprint] = useState<HpsAssetFingerprintV1 | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function verify(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setResult(null); setFingerprint(null);
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
    } catch (e: any) {
      setError(e.message || "Unable to verify file.");
    } finally {
      setBusy(false);
    }
  }

  const best = result?.records?.[0];
  const label = labels[best?.verificationClass] || null;

  return <main className="pageShell"><Nav/>
    <header className="pageHead shell">
      <p className="eyebrow">HPS VERIFY · TRANSFORMATION PROVENANCE</p>
      <h1>Verify originals and compressed derivatives.</h1>
      <p>HPS first checks the exact SHA-256. If the bytes changed, it compares signed canonical-text and visual fingerprints to distinguish non-material compression from modified content.</p>
    </header>

    <section className="verifyBox">
      <div className="fileDrop">
        <p className="micro">LOCAL FINGERPRINTING</p>
        <h2>Upload the file in front of you.</h2>
        <input type="file" onChange={e => verify(e.target.files?.[0])}/>
        {busy && <p className="muted">Building exact, text and visual fingerprints…</p>}
        <p className="muted">The file is fingerprinted in your browser. HPS receives fingerprints, not the uploaded file bytes.</p>
      </div>

      {error && <div className="errorBox">{error}</div>}

      {fingerprint && <details className="advancedVerify">
        <summary>Fingerprint generated</summary>
        <pre className="codeBox">{JSON.stringify(fingerprint, null, 2)}</pre>
      </details>}

      {result && <div className="result">
        {best && label ? <>
          <div className={label.tone === "negative" ? "revocationBanner" : "successPanel"}>
            <p className="micro">HPS TRANSFORMATION RESULT</p>
            <h2>{label.title}</h2>
            <p>{best.title} · {best.creatorName}</p>
          </div>

          <div className="verificationGrid">
            <div><span>Exact SHA-256</span><strong>{best.comparison?.exactHashMatch ? "✓ Exact" : "Different bytes"}</strong></div>
            <div><span>Canonical text</span><strong>{best.comparison?.canonicalTextMatch === true ? "✓ Identical" : best.comparison?.canonicalTextMatch === false ? "Changed" : "Unavailable"}</strong></div>
            <div><span>Visual similarity</span><strong>{typeof best.comparison?.visualSimilarity === "number" ? `${(best.comparison.visualSimilarity * 100).toFixed(1)}%` : "Unavailable"}</strong></div>
            <div><span>Assurance</span><strong>{best.assurance || "unknown"}</strong></div>
            <div><span>Registry signature</span><strong className={best.validRegistrySignature ? "positive" : "negative"}>{best.validRegistrySignature ? "✓ Valid" : "✕ Invalid"}</strong></div>
            <div><span>Record status</span><strong>{best.status}</strong></div>
          </div>

          {best.comparison?.reasons?.length > 0 && <div className="statusBox">
            {best.comparison.reasons.map((reason: string, i: number) => <p key={i}>{reason}</p>)}
          </div>}

          <div className="actions">
            <Link className="button primary" href={`/records/${best.id}`}>Open provenance record</Link>
            <Link className="button darkButton" href="/verify">Exact / manifest verifier</Link>
          </div>
        </> : <>
          <h2>No HPS relationship established.</h2>
          <p>HPS found no exact original, registered derivative, or sufficiently strong transformation relationship. This does not prove the file is false; it means HPS cannot connect it to a registered asset.</p>
        </>}

        <details><summary>Technical result</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
      </div>}
    </section>
  </main>;
}
