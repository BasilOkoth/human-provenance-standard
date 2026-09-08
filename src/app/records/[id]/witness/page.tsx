"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { buildContentIntegrityWitness } from "@/lib/hps/content-witness-client";

export default function ContentWitnessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [record, setRecord] = useState<any>(null);
  const [existing, setExisting] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
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

      if (witnessResponse.ok) setExisting(witnessData);
    })();
  }, [id]);

  async function selectOriginal(file?: File) {
    if (!file) return;

    setBusy(true);
    setMessage("");
    setPreview(null);

    try {
      const built = await buildContentIntegrityWitness(file);

      if (
        record?.asset_hash &&
        built.assetHash.toLowerCase() !== String(record.asset_hash).toLowerCase()
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
        `✓ Content Integrity Witness enabled with ${data.entryCount} registered critical-value anchors.`
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
        <h1>Enable one-file material-change verification.</h1>
        <p>
          The record owner or authorized issuer uploads the exact original once.
          HPS extracts selected critical values such as amounts, dates, percentages
          and numbers and registers a signed comparison witness. Future verifiers
          need only the document they received.
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
              {existing.entryCount} critical-value anchors registered · registry
              signature {existing.validRegistrySignature === false ? "invalid" : "valid"}
            </p>
          </div>
        )}

        <div className="fileDrop" style={{ marginTop: 18 }}>
          <p className="micro">OWNER / ISSUER SETUP</p>
          <h2>Select the exact registered original.</h2>
          <input type="file" onChange={e => selectOriginal(e.target.files?.[0])} />
          {busy && (
            <p className="muted">
              Recovering text and building the critical-value witness locally…
            </p>
          )}
        </div>

        {preview && (
          <div className="accountCard" style={{ marginTop: 18 }}>
            <p className="micro">WITNESS PREVIEW</p>
            <h3>{preview.witness.entries.length} critical values found</h3>
            <p className="muted">
              These selected values — not the complete document — will be stored
              in the HPS witness so a future verifier can be told what material
              value changed.
            </p>

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
                <p>
                  …and {preview.witness.entries.length - 40} more values.
                </p>
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
                I understand that the selected critical values shown above will
                be stored as part of a public-verification witness. The full
                document file is not uploaded by this feature.
              </span>
            </label>

            <button
              className="button primary"
              style={{ marginTop: 14 }}
              disabled={!accepted || saving}
              onClick={registerWitness}
            >
              {saving ? "Registering witness…" : "Enable Content Integrity Witness"}
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
            Test verification
          </Link>
        </div>
      </section>
    </main>
  );
}
