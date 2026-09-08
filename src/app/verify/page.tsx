"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fingerprintFile } from "@/lib/hps/fingerprint-client";
import { buildContentIntegrityWitness } from "@/lib/hps/content-witness-client";

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
  const [witnessResult, setWitnessResult] = useState<any>(null);
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

    try {
      const fingerprint = await fingerprintFile(file);
      const r = await fetch("/api/verify/asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetHash: fingerprint.exactSha256,
          fingerprint
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to verify file.");

      setFileResult({
        ...data,
        fileName: file.name,
        fingerprint
      });

      const best = data?.records?.[0];

      if (
        best &&
        best.verificationClass !== "exact_original" &&
        best.status !== "revoked"
      ) {
        try {
          const candidate = await buildContentIntegrityWitness(file);

          const witnessResponse = await fetch("/api/verify/content-witness", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              recordId: best.id,
              candidateWitness: candidate.witness
            })
          });

          const witnessData = await witnessResponse.json();

          if (witnessResponse.ok && witnessData.available) {
            setWitnessResult(witnessData);
          }
        } catch {
          // The resilient provenance result remains valid even if this optional
          // explanatory layer cannot extract suitable text.
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
        body: manifestText
      });
      setManifestResult(await r.json());
    } catch {
      setManifestResult({
        validSchema: false,
        error: "Invalid manifest."
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

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS VERIFY</p>
        <h1>Check the file in front of you.</h1>
        <p>
          HPS checks exact SHA-256 first. For scans and reformatted documents
          it can also use browser OCR, canonical content, document structure
          and supporting visual fingerprints to identify likely provenance
          relationships. Where the issuer or creator has enabled a Content
          Integrity Witness, HPS can also identify changed registered critical
          values from this one uploaded candidate.
        </p>
      </header>

      <section className="verifyBox">
        <div className="fileDrop">
          <p className="micro">LOCAL DOCUMENT FINGERPRINTING</p>
          <h2>Upload the file.</h2>
          <input type="file" onChange={e => verifyFile(e.target.files?.[0])} />
          {busy && (
            <p className="muted">
              Checking exact identity, resilient provenance and available
              content-integrity witnesses… Scanned documents may take longer.
            </p>
          )}
          <p className="muted">
            Your file bytes stay in the browser. HPS receives fingerprints.
            When a registered Content Integrity Witness is available, selected
            extracted critical values such as amounts, dates, percentages and
            numbers may also be compared with the registered witness; the full
            document text is not posted by this feature.
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
                        best.validRegistrySignature
                          ? "positive"
                          : "negative"
                      }
                    >
                      {best.validRegistrySignature
                        ? "✓ Valid"
                        : "✕ Invalid"}
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

                {witnessResult?.status ===
                  "material_change_detected" && (
                  <div
                    className="errorBox"
                    style={{ marginTop: 18 }}
                  >
                    <p className="micro">
                      REGISTERED CONTENT INTEGRITY WITNESS
                    </p>
                    <h2>⚠ Material value change detected</h2>
                    <p>
                      HPS matched this candidate to signed critical-value
                      anchors registered from the exact original and found{" "}
                      <strong>
                        {witnessResult.materialChangeCount}
                      </strong>{" "}
                      changed value
                      {witnessResult.materialChangeCount === 1 ? "" : "s"}.
                    </p>

                    <div
                      className="statusBox"
                      style={{ marginTop: 12 }}
                    >
                      {witnessResult.changes.map(
                        (change: any, i: number) => (
                          <div
                            key={i}
                            style={{ padding: "8px 0" }}
                          >
                            <p style={{ margin: 0 }}>
                              <strong>
                                {String(
                                  change.category
                                ).toUpperCase()}
                              </strong>
                              {change.label
                                ? ` · ${change.label}`
                                : ""}
                            </p>
                            <p style={{ margin: "5px 0 0" }}>
                              <code>{change.originalValue}</code>
                              {" → "}
                              <code>{change.candidateValue}</code>
                            </p>
                          </div>
                        )
                      )}
                    </div>

                    <p className="muted">
                      Witness match coverage:{" "}
                      {Math.round(
                        (witnessResult.coverage || 0) * 100
                      )}
                      %. This explains a registered value difference; it
                      does not by itself determine whether the candidate
                      is fraudulent.
                    </p>
                  </div>
                )}

                {witnessResult?.status ===
                  "critical_values_consistent" && (
                  <div
                    className="successPanel"
                    style={{ marginTop: 18 }}
                  >
                    <p className="micro">
                      REGISTERED CONTENT INTEGRITY WITNESS
                    </p>
                    <h3>
                      ✓ No changed registered critical values found
                    </h3>
                    <p>
                      HPS matched{" "}
                      {witnessResult.matchedEntries} registered
                      critical-value anchors with no value change among
                      those matches.
                    </p>
                  </div>
                )}

                {witnessResult?.status === "inconclusive" && (
                  <div className="notice" style={{ marginTop: 18 }}>
                    <strong>
                      Content witness comparison was inconclusive.
                    </strong>
                    <p>
                      A witness exists, but too few critical-value
                      anchors matched this representation to make a
                      reliable value-level comparison.
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
                    Detailed scan / cross-format analysis
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2>No HPS relationship found.</h2>
                <p>
                  HPS found no exact asset or sufficiently strong
                  registered, textual, structural or visual
                  relationship. This does not prove the file is false;
                  it means HPS cannot connect it to a registered asset
                  with the available evidence.
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
              <pre>{JSON.stringify(
                {
                  verification: fileResult,
                  contentWitness: witnessResult,
                },
                null,
                2
              )}</pre>
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
