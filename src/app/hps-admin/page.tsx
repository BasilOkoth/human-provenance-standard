"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import styles from "./page.module.css";

type Review = {
  id: string;
  previous_status: string | null;
  decision: "pending" | "verified" | "rejected" | "suspended";
  note: string | null;
  reviewer_user_id: string;
  created_at: string;
};

type Organization = {
  id: string;
  slug: string;
  name: string;
  verification_status: "pending" | "verified" | "rejected" | "suspended" | string;
  verified_at: string | null;
  verified_by: string | null;
  created_by: string | null;
  created_at: string;
  reviews: Review[];
};

const statuses = ["all", "pending", "verified", "rejected", "suspended"] as const;

export default function HpsAdminPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [filter, setFilter] = useState<(typeof statuses)[number]>("pending");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/hps-admin/organizations", {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        setForbidden(true);
        setMessage(data.error || "HPS administrator access required.");
        return;
      }

      if (!response.ok) {
        setMessage(data.error || "Unable to load organizations.");
        return;
      }

      const rows = data.organizations || [];
      setOrganizations(rows);
      if (!selectedId && rows.length) {
        const firstPending = rows.find((row: Organization) => row.verification_status === "pending");
        setSelectedId((firstPending || rows[0]).id);
      }
    } catch {
      setMessage("Unable to load the HPS administration queue.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return organizations.filter((org) => {
      const statusMatch = filter === "all" || org.verification_status === filter;
      const searchMatch =
        !query ||
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query) ||
        org.id.toLowerCase().includes(query);

      return statusMatch && searchMatch;
    });
  }, [organizations, filter, search]);

  const selected =
    organizations.find((org) => org.id === selectedId) ?? filtered[0] ?? null;

  async function decide(status: "pending" | "verified" | "rejected" | "suspended") {
    if (!selected) return;

    if (
      status === "verified" &&
      !window.confirm(
        `Verify ${selected.name}? This will mark the institution as HPS verified.`
      )
    ) {
      return;
    }

    if (
      (status === "rejected" || status === "suspended") &&
      note.trim().length < 5
    ) {
      setMessage("Add a short review note before rejecting or suspending an institution.");
      return;
    }

    setActing(true);
    setMessage("");

    try {
      const response = await fetch("/api/hps-admin/organizations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: selected.id,
          status,
          note,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Unable to update institution.");
        return;
      }

      setMessage(`${selected.name} is now ${status}.`);
      setNote("");
      await load();
    } catch {
      setMessage("Unable to update institution.");
    } finally {
      setActing(false);
    }
  }

  const counts = useMemo(() => {
    const result: Record<string, number> = {
      all: organizations.length,
      pending: 0,
      verified: 0,
      rejected: 0,
      suspended: 0,
    };

    for (const org of organizations) {
      if (org.verification_status in result) {
        result[org.verification_status] += 1;
      }
    }

    return result;
  }, [organizations]);

  if (forbidden) {
    return (
      <main className="pageShell">
        <Nav />
        <section className={styles.accessCard}>
          <p className={styles.eyebrow}>HPS ADMINISTRATION</p>
          <h1>Restricted area</h1>
          <p>{message}</p>
          <p className={styles.muted}>
            Your signed-in email must be listed in the server-side
            <code> HPS_ADMIN_EMAILS </code>
            environment variable.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>HPS ADMINISTRATION</p>
          <h1>Institution verification</h1>
          <p>
            Review organizations, record decisions and control which institutions may
            present themselves as HPS verified.
          </p>
        </div>
        <button className={styles.refresh} onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh queue"}
        </button>
      </header>

      <section className={styles.stats}>
        {statuses.map((status) => (
          <button
            key={status}
            className={`${styles.stat} ${filter === status ? styles.statActive : ""}`}
            onClick={() => setFilter(status)}
          >
            <span>{status}</span>
            <strong>{counts[status] ?? 0}</strong>
          </button>
        ))}
      </section>

      <section className={styles.workspace}>
        <aside className={styles.queue}>
          <div className={styles.queueHead}>
            <h2>Verification queue</h2>
            <input
              aria-label="Search organizations"
              placeholder="Search organization…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className={styles.orgList}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>No organizations match this view.</div>
            ) : (
              filtered.map((org) => (
                <button
                  key={org.id}
                  className={`${styles.orgRow} ${
                    selected?.id === org.id ? styles.orgRowActive : ""
                  }`}
                  onClick={() => {
                    setSelectedId(org.id);
                    setNote("");
                    setMessage("");
                  }}
                >
                  <div>
                    <strong>{org.name}</strong>
                    <span>{org.slug}</span>
                  </div>
                  <span className={`${styles.status} ${styles[`status_${org.verification_status}`] || ""}`}>
                    {org.verification_status}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={styles.reviewPanel}>
          {!selected ? (
            <div className={styles.empty}>Select an organization to review.</div>
          ) : (
            <>
              <div className={styles.reviewHead}>
                <div>
                  <p className={styles.eyebrow}>ORGANIZATION REVIEW</p>
                  <h2>{selected.name}</h2>
                  <p className={styles.muted}>/{selected.slug}</p>
                </div>
                <span className={`${styles.bigStatus} ${styles[`status_${selected.verification_status}`] || ""}`}>
                  {selected.verification_status}
                </span>
              </div>

              <div className={styles.detailGrid}>
                <div>
                  <span>Organization ID</span>
                  <code>{selected.id}</code>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{new Date(selected.created_at).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Created by</span>
                  <code>{selected.created_by || "Not recorded"}</code>
                </div>
                <div>
                  <span>Verified at</span>
                  <strong>
                    {selected.verified_at
                      ? new Date(selected.verified_at).toLocaleString()
                      : "Not verified"}
                  </strong>
                </div>
              </div>

              <div className={styles.notice}>
                <strong>Reviewer responsibility</strong>
                <p>
                  Approval means HPS has reviewed sufficient evidence that this
                  organization is legitimately represented. It does not certify every
                  document the organization may later issue.
                </p>
              </div>

              <label className={styles.note}>
                <span>Review note</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Record what you checked, evidence used, reason for the decision, or follow-up required."
                  rows={5}
                />
              </label>

              <div className={styles.actions}>
                <button
                  className={styles.approve}
                  disabled={acting}
                  onClick={() => decide("verified")}
                >
                  Verify institution
                </button>
                <button
                  className={styles.neutral}
                  disabled={acting}
                  onClick={() => decide("pending")}
                >
                  Return to pending
                </button>
                <button
                  className={styles.reject}
                  disabled={acting}
                  onClick={() => decide("rejected")}
                >
                  Reject
                </button>
                <button
                  className={styles.suspend}
                  disabled={acting}
                  onClick={() => decide("suspended")}
                >
                  Suspend
                </button>
              </div>

              {message && <div className={styles.message}>{message}</div>}

              <div className={styles.history}>
                <h3>Decision history</h3>
                {selected.reviews?.length ? (
                  selected.reviews.map((review) => (
                    <article key={review.id}>
                      <div>
                        <strong>{review.decision}</strong>
                        <span>{new Date(review.created_at).toLocaleString()}</span>
                      </div>
                      <p>{review.note || "No review note recorded."}</p>
                      <code>Reviewer: {review.reviewer_user_id}</code>
                    </article>
                  ))
                ) : (
                  <p className={styles.muted}>No administrative decisions recorded yet.</p>
                )}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
