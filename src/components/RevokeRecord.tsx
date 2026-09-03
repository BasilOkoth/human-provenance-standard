"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function RevokeRecord({
  recordId,
  status,
}: {
  recordId: string;
  status: string;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createBrowserSupabase();

    (async () => {
      const { data } = await supabase.auth.getUser();
      setSignedIn(Boolean(data.user));
    })();
  }, []);

  if (status !== "active" || !signedIn) return null;

  async function revoke() {
    if (reason.trim().length < 5) {
      setMessage("Please provide a clear revocation reason.");
      return;
    }

    if (!confirmed) {
      setMessage("Confirm that you understand the record will remain publicly visible as revoked.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/records/${recordId}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Unable to revoke this record.");
        return;
      }

      window.location.reload();
    } catch {
      setMessage("Unable to reach the HPS registry. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 28,
        border: "1px solid rgba(150, 35, 35, .28)",
        borderRadius: 18,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: "100%",
          border: 0,
          background: "transparent",
          color: "inherit",
          padding: "18px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>
          <strong style={{ display: "block" }}>Record controls</strong>
          <span style={{ display: "block", opacity: 0.62, marginTop: 3, fontSize: 13 }}>
            Available to the record owner or an authorized institutional issuer.
          </span>
        </span>
        <span style={{ opacity: 0.6 }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div
          style={{
            borderTop: "1px solid rgba(150, 35, 35, .18)",
            padding: 20,
          }}
        >
          <p className="micro" style={{ marginBottom: 8 }}>
            REVOCATION
          </p>

          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Revoke this provenance record</h3>

          <p style={{ opacity: 0.72, lineHeight: 1.6, marginTop: 0 }}>
            Revocation does not delete the HPS record. The record remains publicly
            discoverable with a <strong>REVOKED</strong> status so that provenance
            history cannot be silently erased.
          </p>

          <div className="field" style={{ marginTop: 18 }}>
            <label>Reason for revocation</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="e.g. Issued in error, document withdrawn, signing key compromised..."
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 110,
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginTop: 14,
              fontSize: 14,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I understand that this action changes the record to revoked and that
              its public provenance history will remain visible.
            </span>
          </label>

          {message && (
            <div className="notice" style={{ marginTop: 16 }}>
              {message}
            </div>
          )}

          <div className="actions" style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={revoke}
              disabled={busy || !confirmed || reason.trim().length < 5}
              className="button darkButton"
              style={{
                borderColor: "rgba(150, 35, 35, .48)",
                opacity: busy || !confirmed || reason.trim().length < 5 ? 0.55 : 1,
              }}
            >
              {busy ? "Revoking…" : "Revoke record"}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMessage("");
              }}
              className="textButton"
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
