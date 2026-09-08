"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { buildContentIntegrityWitness } from "@/lib/hps/content-witness-client";
import type { ContentWitnessMode } from "@/lib/hps/content-witness-schema";

export default function ContentWitnessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [record, setRecord] = useState<any>(null);
  const [existing, setExisting] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ContentWitnessMode>("public_values");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [recordResponse, witnessResponse] = await Promise.all([
        fetch(`/api/records/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/records/${encodeURIComponent(id)}/content-witness`, {
          cache: "no-store",
        }),
      ]);

      const recordData = await recordResponse.json();
      const witnessData = await witnessResponse.json();

      if (recordResponse.ok) setRecord(recordData.record);
      else setMessage(recordData.error || "Unable to load HPS record.");

      if (witnessResponse.ok) {
        setExisting(witnessData);
        if (
          witnessData.mode === "public_values" ||
          witnessData.mode === "public_text"
        ) {
          setMode(witnessData.mode);
        }
      }
    })();
  }, [id]);

  async function buildPreview(file: File, selectedMode: ContentWitnessMode) {
    setBusy(true);
    setMessage("");
    setPreview(null);

    try {
      const built = await buildContentIntegrityWitness(file, {
        mode: selectedMode,
      });

      if (
        record?.asset_hash &&
        built.assetHash.toLowerCase() !==
          String(record.asset_hash).toLowerCase()
      ) {
        throw new Error(
          "This is not the exact registered original. Select the file whose SHA-256 matches the HPS record."
        );
      }

      setPreview({
        fileName: file.name,
        ...built,
      });
    } catch (error: any) {
      setMessage(error.message || "Unable to build content witness.");
    } finally {
      setBusy(false);
    }
  }

  async function selectOriginal(file?: File) {
    if (!file) return;
    setSourceFile(file);
    setAccepted(false);
    await buildPreview(file, mode);
  }

  async function changeMode(nextMode: ContentWitnessMode) {
    setMode(nextMode);
    setAccepted(false);
    setPreview(null);
    if (sourceFile) {
      await buildPreview(sourceFile, nextMode);
    }
  }

  async function registerWitness() {
    if (!preview || !accepted) return;

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/records/${encodeURIComponent(id)}/content-witness`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assetHash: preview.assetHash,
            witness: preview.witness,
            disclosureAccepted: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to register witness.");
      }

      setExisting(data);
      setAccepted(false);
      setMessage(
        mode === "public_text"
          ? `✓ Public Text Integrity Witness enabled with ${data.publicTextTokenCount ?? "the recovered"} text tokens and ${data.entryCount} critical-value anchors. Future verifiers can upload only the candidate and HPS can explain word-level changes.`
          : `✓ Content Integrity Witness enabled with ${data.entryCount} registered critical-value anchors.`
      );
    } catch (error: any) {
      setMessage(error.message || "Unable to register witness.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS · CONTENT INTEGRITY WITNESS</p>
        <h1>Enable one-file change verification.</h1>
        <p>
          The owner or authorized issuer selects the exact registered original
          once. Future verifiers can then upload only the document they received.
        </p>
      </header>

      <section className="verifyBox">
        {record && (
          <div className="accountCard">
            <p className="micro">HPS RECORD</p>
            <h2>{record.title}</h2>
            <p className="muted">{record.id}</p>
            <div className="hashBox">
              <span>REGISTERED ASSET SHA-256</span>
              <code>{record.asset_hash}</code>
            </div>
          </div>
        )}

        {existing?.enabled && (
          <div className="successPanel" style={{ marginTop: 18 }}>
            <p className="micro">CURRENT STATUS</p>
            <h2>✓ Content Integrity Witness enabled</h2>
            <p>
              Mode:{" "}
              <strong>
                {existing.mode === "public_text"
                  ? "Public textual integrity"
                  : "Critical values only"}
              </strong>
              {" · "}
              {existing.entryCount} critical-value anchors
              {existing.publicTextTokenCount
                ? ` · ${existing.publicTextTokenCount} public text tokens`
                : ""}
            </p>
          </div>
        )}

        <div className="accountCard" style={{ marginTop: 18 }}>
          <p className="micro">VERIFICATION MODE</p>
          <h3>Choose how much the registry may remember.</h3>

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              marginTop: 14,
            }}
          >
            <input
              type="radio"
              name="witness-mode"
              checked={mode === "public_values"}
              onChange={() => changeMode("public_values")}
            />
            <span>
              <strong>Critical values only</strong>
              <br />
              <span className="muted">
                Stores selected amounts, dates, percentages and numbers with
                hashed anchors. Better privacy, but cannot name an arbitrary
                deleted word.
              </span>
            </span>
          </label>

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              marginTop: 14,
            }}
          >
            <input
              type="radio"
              name="witness-mode"
              checked={mode === "public_text"}
              onChange={() => changeMode("public_text")}
            />
            <span>
              <strong>Public textual integrity</strong>
              <br />
              <span className="muted">
                Stores the normalized recovered text as a signed public
                verification witness. This lets HPS tell future verifiers that a
                word, sentence, number or amount was inserted, deleted or
                replaced without requiring them to possess the original file.
              </span>
            </span>
          </label>
        </div>

        <div className="fileDrop" style={{ marginTop: 18 }}>
          <p className="micro">OWNER / ISSUER SETUP</p>
          <h2>Select the exact registered original.</h2>
          <input type="file" onChange={e => selectOriginal(e.target.files?.[0])} />
          {busy && (
            <p className="muted">
              Recovering text and building the selected witness locally…
            </p>
          )}
        </div>

        {preview && (
          <div className="accountCard" style={{ marginTop: 18 }}>
            <p className="micro">WITNESS PREVIEW</p>
            <h3>
              {mode === "public_text"
                ? `${preview.witness.publicTextTokenCount} text tokens + ${preview.witness.entries.length} critical values`
                : `${preview.witness.entries.length} critical values`}
            </h3>

            {mode === "public_text" ? (
              <>
                <div className="notice" style={{ marginTop: 12 }}>
                  <strong>Public-text disclosure</strong>
                  <p>
                    The normalized recovered text shown below will be stored in
                    the signed HPS witness and can be returned to a verifier's
                    browser for local comparison. Do not enable this mode for a
                    confidential document whose textual contents should remain
                    private.
                  </p>
                </div>

                <details className="advancedVerify" style={{ marginTop: 12 }}>
                  <summary>Preview recovered public text</summary>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      maxHeight: 420,
                      overflow: "auto",
                    }}
                  >
                    {preview.witness.publicText}
                  </pre>
                </details>
              </>
            ) : (
              <p className="muted">
                Only the selected critical values below will be stored; complete
                recovered text is not included in this mode.
              </p>
            )}

            <div className="statusBox" style={{ marginTop: 12 }}>
              {preview.witness.entries.slice(0, 40).map((entry: any, i: number) => (
                <p key={i}>
                  <strong>{entry.category.toUpperCase()}</strong>
                  {" · "}
                  {entry.label ? `${entry.label}: ` : ""}
                  <code>{entry.value}</code>
                </p>
              ))}
              {preview.witness.entries.length > 40 && (
                <p>…and {preview.witness.entries.length - 40} more values.</p>
              )}
            </div>

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginTop: 16,
              }}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
              />
              <span className="muted">
                {mode === "public_text"
                  ? "I explicitly approve storing the normalized recovered document text and critical values as a public-verification witness. I understand that the original file bytes are not stored by this feature, but the recovered text will be retrievable for verification."
                  : "I approve storing the selected critical values shown above as a public-verification witness. The complete recovered document text is not stored in this mode."}
              </span>
            </label>

            <button
              className="button primary"
              style={{ marginTop: 14 }}
              disabled={!accepted || saving}
              onClick={registerWitness}
            >
              {saving
                ? "Registering witness…"
                : mode === "public_text"
                  ? "Enable Public Text Integrity Witness"
                  : "Enable Critical-Value Witness"}
            </button>
          </div>
        )}

        {message && (
          <div
            className={message.startsWith("✓") ? "successPanel" : "errorBox"}
            style={{ marginTop: 16 }}
          >
            {message}
          </div>
        )}

        <div className="actions" style={{ marginTop: 18 }}>
          <Link className="button darkButton" href={`/records/${id}`}>
            Back to provenance record
          </Link>
          <Link className="button primary" href="/verify">
            Test one-file verification
          </Link>
        </div>
      </section>
    </main>
  );
}
