"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function AdminDisputesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/hps-admin/disputes");
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Unable to load disputes.");
      return;
    }

    setItems(data.disputes || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(disputeId: string, action: string) {
    setBusy(disputeId + action);
    setMessage("");

    const response = await fetch("/api/hps-admin/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        disputeId,
        action,
        reviewNote: notes[disputeId] || "",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Unable to update dispute.");
    } else {
      await load();
    }

    setBusy(null);
  }

  return (
    <main className="pageShell">
      <Nav />
      <header className="pageHead shell">
        <p className="eyebrow">HPS TRUST OPERATIONS</p>
        <h1>Provenance disputes.</h1>
        <p>
          Review challenges without treating allegations as findings. Status
          changes remain distinct from the original signed provenance manifest.
        </p>
      </header>

      <section className="recordDetail">
        {message && <div className="notice">{message}</div>}

        {items.length === 0 ? (
          <p className="muted">No disputes found.</p>
        ) : (
          <div className="attestationList">
            {items.map((d: any) => (
              <article key={d.id}>
                <div>
                  <span>{String(d.category).replaceAll("_", " ")}</span>
                  <strong>{String(d.status).replaceAll("_", " ")}</strong>
                </div>

                <p>{d.statement}</p>

                <footer>
                  Record:{" "}
                  <Link href={`/records/${d.record_id}`}>{d.record_id}</Link>
                  {" · "}
                  {new Date(d.created_at).toLocaleString()}
                </footer>

                {d.evidence_url && (
                  <p>
                    <a href={d.evidence_url} target="_blank" rel="noreferrer">
                      Review supplied evidence ↗
                    </a>
                  </p>
                )}

                {["open", "under_review"].includes(d.status) && (
                  <>
                    <div className="field" style={{ marginTop: 18 }}>
                      <label>Reviewer note / finding</label>
                      <textarea
                        rows={4}
                        value={notes[d.id] || ""}
                        onChange={e =>
                          setNotes(current => ({ ...current, [d.id]: e.target.value }))
                        }
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div className="actions">
                      {d.status === "open" && (
                        <button
                          className="button darkButton"
                          onClick={() => act(d.id, "start_review")}
                          disabled={busy !== null}
                        >
                          Start review
                        </button>
                      )}

                      <button
                        className="button darkButton"
                        onClick={() => act(d.id, "dismiss")}
                        disabled={busy !== null}
                      >
                        Resolve — no material issue
                      </button>

                      <button
                        className="button darkButton"
                        onClick={() => act(d.id, "misrepresentation")}
                        disabled={busy !== null}
                      >
                        Misrepresentation found → revoke
                      </button>
                    </div>
                  </>
                )}

                {d.review_note && (
                  <div className="notice" style={{ marginTop: 16 }}>
                    <strong>Review note</strong>
                    <p>{d.review_note}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
