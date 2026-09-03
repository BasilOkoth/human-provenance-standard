"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useParams } from "next/navigation";

const options = [
  ["authorship", "Authorship or contribution"],
  ["ownership", "Ownership or rights"],
  ["identity", "Identity claim"],
  ["institutional_authority", "Institutional authority"],
  ["evidence", "Supporting evidence"],
  ["ai_use_disclosure", "AI-use disclosure"],
  ["document_validity", "Document validity"],
  ["other", "Other provenance issue"],
];

export default function DisputeRecordPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [category, setCategory] = useState("authorship");
  const [statement, setStatement] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (statement.trim().length < 20) {
      setMessage("Please explain the concern in at least 20 characters.");
      return;
    }

    if (!confirmed) {
      setMessage("Please confirm the accuracy statement before submitting.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/records/${id}/disputes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          category,
          statement: statement.trim(),
          evidenceUrl: evidenceUrl.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Unable to submit dispute.");
        return;
      }

      if (!result.disputeId) {
        setMessage(
          "Challenge was submitted, but HPS could not open the private evidence workspace."
        );
        return;
      }

      window.location.href = `/disputes/${result.disputeId}`;
    } catch {
      setMessage("Unable to reach the HPS registry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS PROVENANCE CHALLENGE</p>

        <h1>Challenge a provenance claim.</h1>

        <p>
          A dispute does not automatically invalidate a record. It creates a
          reviewable challenge to the provenance information associated with
          <strong> {id}</strong>.
        </p>
      </header>

      <section className="accountGrid">
        <div className="accountCard">
          <p className="micro">SUBMIT CHALLENGE</p>

          <h2>Describe the provenance issue</h2>

          <p className="muted">
            After submitting the challenge, you will be taken to a private case
            workspace where you can upload supporting files. Every uploaded file
            will be SHA-256 hashed and preserved under the dispute case.
          </p>

          <div className="field">
            <label>Category</label>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>What do you believe is incorrect or misleading?</label>

            <textarea
              rows={7}
              maxLength={5000}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Explain the provenance concern and the basis for your challenge."
              style={{
                width: "100%",
                resize: "vertical",
              }}
            />
          </div>

          <div className="field">
            <label>
              Supporting evidence URL{" "}
              <span style={{ opacity: 0.6 }}>(optional)</span>
            </label>

            <input
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://..."
            />

            <p className="muted">
              You can also upload private evidence files securely after the
              challenge is submitted.
            </p>
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
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: 3 }}
            />

            <span>
              I believe this challenge is made in good faith and the information
              I have provided is accurate to the best of my knowledge.
            </span>
          </label>

          {message && (
            <div className="notice" style={{ marginTop: 16 }}>
              {message}
            </div>
          )}

          <div className="actions" style={{ marginTop: 20 }}>
            <button
              className="button primary"
              disabled={
                busy ||
                !confirmed ||
                statement.trim().length < 20
              }
              onClick={submit}
            >
              {busy
                ? "Creating private dispute case…"
                : "Submit challenge & add evidence"}
            </button>

            <Link className="button ghost" href={`/records/${id}`}>
              Cancel
            </Link>
          </div>
        </div>

        <div className="accountCard darkAccount">
          <p className="micro">HOW HPS HANDLES DISPUTES</p>

          <h2>A challenge is not a verdict.</h2>

          <p>
            Submission alone does not revoke a record and does not establish
            that the original claim was false.
          </p>

          <div className="trustStack">
            <div>
              <b>01</b>
              <span>Challenge submitted</span>
              <strong>OPEN</strong>
            </div>

            <div>
              <b>02</b>
              <span>Private evidence submitted</span>
              <strong>HASHED</strong>
            </div>

            <div>
              <b>03</b>
              <span>Accepted for formal review</span>
              <strong>UNDER REVIEW</strong>
            </div>

            <div>
              <b>04</b>
              <span>No material issue found</span>
              <strong>ACTIVE</strong>
            </div>

            <div>
              <b>05</b>
              <span>Material misrepresentation found</span>
              <strong>REVOKED</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
