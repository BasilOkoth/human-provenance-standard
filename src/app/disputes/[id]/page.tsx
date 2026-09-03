"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useParams } from "next/navigation";

type EvidenceFile = {
  id: string;
  uploader_role: "challenger" | "record_holder";
  purpose: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  registered_asset_hash?: string | null;
  exact_asset_match: boolean;
  note?: string | null;
  created_at: string;
};

export default function DisputeCasePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [recordId, setRecordId] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [status, setStatus] = useState("");
  const [registeredHash, setRegisteredHash] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("supporting_evidence");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`/api/disputes/${id}/files`);
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Unable to load dispute case.");
      return;
    }

    setFiles(data.files || []);
    setRecordId(data.recordId || "");
    setViewerRole(data.viewerRole || "");
    setStatus(data.disputeStatus || "");
    setRegisteredHash(data.registeredAssetHash || "");
  }

  useEffect(() => {
    load();
  }, [id]);

  async function upload() {
    if (!file) {
      setMessage("Select a file first.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    if (note.trim()) form.append("note", note.trim());

    setBusy(true);
    setMessage("");

    const response = await fetch(`/api/disputes/${id}/files`, {
      method: "POST",
      body: form,
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Unable to upload evidence.");
      setBusy(false);
      return;
    }

    setMessage(
      data.verification?.exactRegisteredAsset
        ? "✓ Uploaded securely. SHA-256 EXACT MATCH with the registered HPS asset."
        : "Uploaded securely. SHA-256 recorded; this file is not an exact match with the registered asset."
    );

    setFile(null);
    setNote("");
    await load();
    setBusy(false);
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS PRIVATE DISPUTE CASE</p>
        <h1>Evidence review workspace.</h1>
        <p>
          Files are private, SHA-256 hashed on receipt and preserved under this
          dispute. Access is limited to the challenger, authorized record holder
          and HPS reviewers.
        </p>
      </header>

      <section className="recordDetail">
        <div className="verificationGrid">
          <div>
            <span>Dispute</span>
            <strong>{id}</strong>
          </div>
          <div>
            <span>Record</span>
            <strong>
              {recordId ? <Link href={`/records/${recordId}`}>{recordId}</Link> : "—"}
            </strong>
          </div>
          <div>
            <span>Your role</span>
            <strong>{viewerRole.replaceAll("_", " ") || "—"}</strong>
          </div>
          <div>
            <span>Case status</span>
            <strong>{status.replaceAll("_", " ") || "—"}</strong>
          </div>
        </div>

        <div className="notice" style={{ marginTop: 18 }}>
          <strong>Registered asset fingerprint</strong>
          <p><code>{registeredHash || "Unavailable"}</code></p>
          <p className="muted">
            When an uploaded file has this exact SHA-256 value, HPS can state that
            the supplied file is byte-for-byte identical to the asset registered
            in the provenance record.
          </p>
        </div>

        {["open", "under_review"].includes(status) && (
          <div className="accountCard" style={{ marginTop: 24 }}>
            <p className="micro">PRIVATE EVIDENCE UPLOAD</p>
            <h2>
              {viewerRole === "record_holder"
                ? "Respond with evidence"
                : "Add evidence to your challenge"}
            </h2>

            <div className="field">
              <label>Evidence purpose</label>
              <select value={purpose} onChange={e => setPurpose(e.target.value)}>
                <option value="supporting_evidence">Supporting evidence</option>
                <option value="original_asset">Original / disputed asset</option>
                <option value="response_evidence">Response evidence</option>
              </select>
            </div>

            <div className="field">
              <label>Private file</label>
              <input
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <p className="muted">Maximum 25 MB per file.</p>
            </div>

            <div className="field">
              <label>Note</label>
              <textarea
                rows={4}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Explain what this file demonstrates."
                style={{ width: "100%" }}
              />
            </div>

            <button
              className="button primary"
              onClick={upload}
              disabled={busy || !file}
            >
              {busy ? "Hashing & preserving…" : "Upload private evidence"}
            </button>

            {message && <div className="notice" style={{ marginTop: 16 }}>{message}</div>}
          </div>
        )}

        <div className="sectionHeader">
          <div>
            <p className="micro">CASE EVIDENCE</p>
            <h2>Preserved submissions</h2>
          </div>
        </div>

        {files.length === 0 ? (
          <p className="muted">No private files have been submitted yet.</p>
        ) : (
          <div className="attestationList">
            {files.map(item => (
              <article key={item.id}>
                <div>
                  <span>{item.uploader_role.replaceAll("_", " ")}</span>
                  <strong>
                    {item.exact_asset_match ? "✓ EXACT REGISTERED ASSET" : "HASH RECORDED"}
                  </strong>
                </div>

                <p>
                  <strong>{item.file_name}</strong>
                  {item.note ? ` · ${item.note}` : ""}
                </p>

                <p>
                  SHA-256 <code>{item.sha256}</code>
                </p>

                <footer>
                  {item.purpose.replaceAll("_", " ")} ·{" "}
                  {Math.ceil(item.file_size / 1024)} KB ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </footer>

                <div className="actions" style={{ marginTop: 12 }}>
                  <a
                    className="button darkButton"
                    href={`/api/disputes/${id}/files/${item.id}/download`}
                  >
                    Open private file
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
