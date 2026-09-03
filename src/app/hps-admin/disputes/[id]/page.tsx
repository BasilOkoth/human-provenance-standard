"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useParams } from "next/navigation";

export default function AdminDisputeReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [targetRole, setTargetRole] = useState("record_holder");
  const [requestText, setRequestText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  async function load() {
    const response = await fetch(`/api/hps-admin/disputes/${id}/evidence`);
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "Unable to load dispute.");
    setData(result);
  }

  useEffect(() => { load(); }, [id]);

  async function requestMore() {
    setBusy(true);
    const response = await fetch(`/api/hps-admin/disputes/${id}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "request_evidence",
        targetRole,
        requestText: requestText.trim(),
        dueAt: dueAt || null,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Unable to request evidence.");
    } else {
      setMessage("Evidence request sent and the relevant party was notified.");
      setRequestText("");
      setDueAt("");
      await load();
    }
    setBusy(false);
  }

  async function reviewAction(action: string) {
    setBusy(true);
    const response = await fetch("/api/hps-admin/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disputeId: id, action, reviewNote }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Review status updated." : (result.error || "Unable to update dispute."));
    await load();
    setBusy(false);
  }

  if (!data) {
    return <main className="pageShell"><Nav /><header className="pageHead shell"><h1>Loading dispute review…</h1>{message && <p>{message}</p>}</header></main>;
  }

  const { dispute, record, files, requests } = data;

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS TRUST OPERATIONS</p>
        <h1>Review dispute.</h1>
        <p>Inspect private evidence, verify exact-file matches and request more material.</p>
      </header>

      <section className="recordDetail">
        {message && <div className="notice">{message}</div>}

        <div className="verificationGrid">
          <div><span>Dispute</span><strong>{dispute.id}</strong></div>
          <div><span>Record</span><strong><Link href={`/records/${record.id}`}>{record.id}</Link></strong></div>
          <div><span>Record status</span><strong>{record.status}</strong></div>
          <div><span>Dispute status</span><strong>{dispute.status}</strong></div>
        </div>

        <div className="notice" style={{ marginTop: 18 }}>
          <strong>Challenge</strong>
          <p>{dispute.statement}</p>
          <p className="muted">Category: {String(dispute.category).replaceAll("_", " ")}</p>
        </div>

        <div className="notice" style={{ marginTop: 18 }}>
          <strong>Registered asset SHA-256</strong>
          <p><code>{record.asset_hash}</code></p>
          <p>Exact registered-asset submissions: <strong>{data.exactAssetSubmissions}</strong></p>
        </div>

        <div className="sectionHeader">
          <div><p className="micro">PRIVATE CASE MATERIAL</p><h2>Submitted documents</h2></div>
        </div>

        {files.length === 0 ? <p className="muted">No private documents submitted yet.</p> : (
          <div className="attestationList">
            {files.map((file: any) => (
              <article key={file.id}>
                <div>
                  <span>{String(file.uploader_role).replaceAll("_", " ")}</span>
                  <strong>{file.exact_asset_match ? "✓ EXACT REGISTERED ASSET" : "HASH RECORDED"}</strong>
                </div>
                <h3>{file.file_name}</h3>
                {file.note && <p>{file.note}</p>}
                <p>SHA-256 <code>{file.sha256}</code></p>
                <footer>{String(file.purpose).replaceAll("_", " ")} · {Math.ceil(file.file_size / 1024)} KB</footer>
                <div className="actions" style={{ marginTop: 12 }}>
                  <a className="button primary" href={`/api/disputes/${id}/files/${file.id}/download`} target="_blank" rel="noreferrer">
                    Open private document
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="sectionHeader">
          <div><p className="micro">EVIDENCE REQUESTS</p><h2>Ask for more material</h2></div>
        </div>

        <div className="accountCard">
          <div className="field">
            <label>Request from</label>
            <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
              <option value="record_holder">Record owner / institution</option>
              <option value="challenger">Challenger</option>
            </select>
          </div>

          <div className="field">
            <label>What must they provide?</label>
            <textarea rows={5} value={requestText} onChange={(e) => setRequestText(e.target.value)} style={{ width: "100%" }} />
          </div>

          <div className="field">
            <label>Requested response date (optional)</label>
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>

          <button className="button primary" disabled={busy || requestText.trim().length < 10} onClick={requestMore}>
            {busy ? "Sending request…" : "Request additional evidence"}
          </button>
        </div>

        {requests.length > 0 && (
          <div className="attestationList" style={{ marginTop: 20 }}>
            {requests.map((request: any) => (
              <article key={request.id}>
                <div>
                  <span>requested from {String(request.target_role).replaceAll("_", " ")}</span>
                  <strong>{String(request.status).toUpperCase()}</strong>
                </div>
                <p>{request.request_text}</p>
                <footer>
                  {new Date(request.created_at).toLocaleString()}
                  {request.due_at ? ` · Due ${new Date(request.due_at).toLocaleString()}` : ""}
                </footer>
              </article>
            ))}
          </div>
        )}

        <div className="sectionHeader">
          <div><p className="micro">REVIEW DECISION</p><h2>Record your finding</h2></div>
        </div>

        <div className="field">
          <label>Reviewer note / finding</label>
          <textarea rows={5} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} style={{ width: "100%" }} />
        </div>

        <div className="actions">
          {dispute.status === "open" && (
            <button className="button darkButton" disabled={busy} onClick={() => reviewAction("start_review")}>
              Start formal review
            </button>
          )}
          {["open", "under_review"].includes(dispute.status) && (
            <>
              <button className="button darkButton" disabled={busy} onClick={() => reviewAction("dismiss")}>
                Resolve — no material issue
              </button>
              <button className="button darkButton" disabled={busy || reviewNote.trim().length < 10} onClick={() => reviewAction("misrepresentation")}>
                Misrepresentation found → revoke
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
