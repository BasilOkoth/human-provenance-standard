"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function RecordLifecycle({
  recordId,
  status,
  issuerOrgId
}: {
  recordId: string;
  status: string;
  issuerOrgId?: string | null;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [replacementId, setReplacementId] = useState("");
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

  if (!signedIn || status !== "active" || !issuerOrgId) {
    return null;
  }

  async function supersede() {
    const cleanReplacementId = replacementId.trim();

    if (!cleanReplacementId) {
      setMessage("Enter the replacement HPS record ID.");
      return;
    }

    if (cleanReplacementId === recordId) {
      setMessage("A record cannot supersede itself.");
      return;
    }

    if (!confirmed) {
      setMessage(
        "Confirm that the replacement record should become the current record."
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/records/${recordId}/supersede`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          replacementId: cleanReplacementId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Unable to supersede this record.");
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
        border: "1px solid rgba(31, 74, 58, .28)",
        borderRadius: 18,
        overflow: "hidden"
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
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
          textAlign: "left"
        }}
      >
        <span>
          <strong style={{ display: "block" }}>Version & supersession</strong>
          <span
            style={{
              display: "block",
              opacity: 0.62,
              marginTop: 3,
              fontSize: 13
            }}
          >
            Available to an authorized institutional issuer.
          </span>
        </span>

        <span style={{ opacity: 0.6 }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div
          style={{
            borderTop: "1px solid rgba(31, 74, 58, .18)",
            padding: 20
          }}
        >
          <p className="micro" style={{ marginBottom: 8 }}>
            VERSIONING
          </p>

          <h3 style={{ marginTop: 0, marginBottom: 8 }}>
            Create an updated version
          </h3>

          <p style={{ opacity: 0.72, lineHeight: 1.6, marginTop: 0 }}>
            Use this when the institution has changed the document and wants a
            new HPS version. The updated file must have different bytes. After
            successful issuance, HPS automatically marks this record as
            superseded and links it to the new version.
          </p>

          <div className="actions" style={{ marginTop: 16 }}>
            <Link
              className="button primary"
              href={`/institutional/${issuerOrgId}?parent=${encodeURIComponent(recordId)}`}
            >
              Create new version
            </Link>
          </div>

          <div
            style={{
              height: 1,
              background: "rgba(31, 74, 58, .16)",
              margin: "26px 0"
            }}
          />

          <p className="micro" style={{ marginBottom: 8 }}>
            MANUAL SUPERSESSION
          </p>

          <h3 style={{ marginTop: 0, marginBottom: 8 }}>
            Replace this record with an already-issued HPS record
          </h3>

          <p style={{ opacity: 0.72, lineHeight: 1.6, marginTop: 0 }}>
            Use this only when the replacement HPS record already exists. HPS
            will keep this record publicly visible as superseded and point to
            the replacement. The replacement must be active and belong to the
            same institution.
          </p>

          <div className="field" style={{ marginTop: 18 }}>
            <label>Replacement HPS record ID</label>
            <input
              value={replacementId}
              onChange={event => setReplacementId(event.target.value)}
              placeholder="HPS-..."
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
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I confirm that this HPS record should be marked superseded by the
              replacement record entered above.
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
              className="button darkButton"
              onClick={supersede}
              disabled={
                busy ||
                !confirmed ||
                replacementId.trim().length < 4
              }
            >
              {busy ? "Superseding…" : "Supersede with replacement"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
