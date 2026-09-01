"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";

function VerifyContent() {
  const params = useSearchParams();
  const [text, setText] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const demo = params.get("demo");

    if (demo) {
      try {
        setText(decodeURIComponent(demo));
      } catch {
        setText(demo);
      }
    }
  }, [params]);

  async function verify() {
    try {
      const data = JSON.parse(text);

      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(data)
      });

      const verification = await response.json();
      setResult(verification);
    } catch {
      setResult({
        validSchema: false,
        validSignature: false,
        error: "The input is not valid HPS JSON."
      });
    }
  }

  function clear() {
    setText("");
    setResult(null);
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS VERIFIER</p>

        <h1>Inspect the provenance.</h1>

        <p>
          Paste an HPS manifest below. The verifier examines individual trust
          signals such as structure, contribution declarations, evidence,
          identity assurance and cryptographic signature status.
        </p>
      </header>

      <section className="verifyBox">
        <label className="micro">HPS MANIFEST</label>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`{
  "hpsVersion": "0.1",
  "id": "HPS-...",
  ...
}`}
        />

        <div className="actions">
          <button
            className="button primary"
            onClick={verify}
            disabled={!text.trim()}
          >
            Verify record
          </button>

          <button
            className="button ghost"
            onClick={clear}
            disabled={!text && !result}
          >
            Clear
          </button>
        </div>

        {result && (
          <div className="result">
            <p className="micro">VERIFICATION RESULT</p>

            <h2 className={result.validSchema ? "success" : "error"}>
              {result.validSchema
                ? "✓ Manifest structure valid"
                : "✕ Verification failed"}
            </h2>

            {result.validSchema && (
              <div className="verificationGrid">
                <div>
                  <span>Schema</span>
                  <strong>✓ Valid</strong>
                </div>

                <div>
                  <span>Signature</span>
                  <strong>
                    {result.validSignature
                      ? "✓ Valid"
                      : "Not signed / not verified"}
                  </strong>
                </div>

                <div>
                  <span>Identity assurance</span>
                  <strong>{result.identityStatus ?? "Unknown"}</strong>
                </div>

                <div>
                  <span>Human contributions</span>
                  <strong>{result.contributions?.human ?? 0}</strong>
                </div>

                <div>
                  <span>AI-assisted contributions</span>
                  <strong>{result.contributions?.aiAssisted ?? 0}</strong>
                </div>

                <div>
                  <span>Automated contributions</span>
                  <strong>{result.contributions?.automated ?? 0}</strong>
                </div>
              </div>
            )}

            <details>
              <summary>Technical verification data</summary>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="pageShell">
          <Nav />

          <section className="pageHead shell">
            <p className="eyebrow">HPS VERIFIER</p>
            <h1>Loading verifier…</h1>
          </section>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
