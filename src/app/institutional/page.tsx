"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

function roleLabel(role?: string) {
  if (!role) return "Member";
  if (role === "admin") return "Administrator";
  if (role === "issuer") return "Authorized issuer";
  if (role === "verifier") return "Verifier";
  if (role === "auditor") return "Auditor";
  return role.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function initials(name?: string) {
  return (name || "HPS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");
}

export default function InstitutionalPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/organizations", { cache: "no-store" });
    const d = await r.json();
    setOrgs(d.organizations || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    const r = await fetch("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug })
    });

    const d = await r.json();

    setMsg(
      r.ok
        ? "Institution created. Verification is pending."
        : d.error || "Unable to create institution."
    );

    if (r.ok) {
      setName("");
      setSlug("");
      await load();
    }
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS INSTITUTIONAL</p>
        <h1>Institutional provenance infrastructure.</h1>
        <p>
          Verified organizations can authorize issuers, cryptographically sign
          records, issue documents individually or in bulk, and maintain an
          auditable provenance trail.
        </p>
      </header>

      <section className="shell" style={{ paddingBottom: 72 }}>
        <div
          className="institutionalOverviewGrid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, .8fr) minmax(0, 1.4fr)",
            gap: 24,
            alignItems: "start"
          }}
        >
          <div className="accountCard">
            <p className="micro">CREATE ORGANIZATION</p>
            <h2>Connect an institution</h2>
            <p style={{ opacity: 0.72, marginTop: 0, marginBottom: 24 }}>
              Create an institutional account, submit verification evidence and
              authorize signing keys before issuing HPS records.
            </p>

            <div className="field">
              <label>Institution name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. HPS Academy"
              />
            </div>

            <div className="field">
              <label>Institution slug</label>
              <input
                value={slug}
                onChange={e =>
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                  )
                }
                placeholder="HPS Academy"
              />
            </div>

            <button
              className="button primary"
              onClick={create}
              disabled={!name.trim() || !slug.trim()}
            >
              Create institution
            </button>

            {msg && <p className="authMessage">{msg}</p>}
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "end",
                marginBottom: 16
              }}
            >
              <div>
                <p className="micro" style={{ marginBottom: 8 }}>
                  YOUR ORGANIZATIONS
                </p>
                <h2 style={{ margin: 0 }}>
                  {orgs.length} connected{" "}
                  {orgs.length === 1 ? "institution" : "institutions"}
                </h2>
              </div>

              <div style={{ fontSize: 13, opacity: 0.58, textAlign: "right" }}>
                Institutional identity · issuer authority · provenance
              </div>
            </div>

            {orgs.length === 0 ? (
              <div
                className="accountCard"
                style={{ minHeight: 220, display: "grid", placeItems: "center" }}
              >
                <div style={{ textAlign: "center", maxWidth: 420 }}>
                  <p className="micro">NO INSTITUTIONS YET</p>
                  <h3>Create your first institutional identity.</h3>
                  <p style={{ opacity: 0.65 }}>
                    Once created, you can submit verification evidence and add
                    authorized issuers.
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
                  gap: 16
                }}
              >
                {orgs.map((o: any) => {
                  const org = o.hps_organizations;
                  if (!org) return null;

                  const verified = org.verification_status === "verified";

                  return (
                    <Link
                      key={org.id}
                      href={`/institutional/${org.id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <article
                        className="accountCard"
                        style={{
                          height: "100%",
                          minHeight: 280,
                          padding: 24,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          cursor: "pointer"
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                              marginBottom: 24
                            }}
                          >
                            <div
                              aria-hidden="true"
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 14,
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 800,
                                letterSpacing: ".04em",
                                border: "1px solid rgba(127,127,127,.22)",
                                background: "rgba(127,127,127,.07)"
                              }}
                            >
                              {initials(org.name)}
                            </div>

                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 7,
                                border: "1px solid rgba(127,127,127,.22)",
                                borderRadius: 999,
                                padding: "7px 10px",
                                fontSize: 12,
                                fontWeight: 700,
                                whiteSpace: "nowrap"
                              }}
                            >
                              <span>{verified ? "✓" : "○"}</span>
                              {verified
                                ? "Verified institution"
                                : "Verification pending"}
                            </span>
                          </div>

                          <p className="micro" style={{ marginBottom: 8 }}>
                            INSTITUTIONAL IDENTITY
                          </p>

                          <h3
                            style={{
                              fontSize: 24,
                              lineHeight: 1.12,
                              marginTop: 0,
                              marginBottom: 10
                            }}
                          >
                            {org.name}
                          </h3>

                          <p style={{ opacity: 0.62, marginTop: 0 }}>
                            {verified
                              ? "Verified institutional issuer in the HPS trust network."
                              : "Verification is required before trusted issuance."}
                          </p>
                        </div>

                        <div
                          style={{
                            borderTop: "1px solid rgba(127,127,127,.18)",
                            paddingTop: 16,
                            marginTop: 24,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 16
                          }}
                        >
                          <div>
                            <span
                              style={{
                                display: "block",
                                opacity: 0.5,
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: ".08em"
                              }}
                            >
                              Access
                            </span>
                            <strong style={{ fontSize: 14 }}>
                              {roleLabel(o.role)}
                            </strong>
                          </div>

                          <strong style={{ fontSize: 14 }}>
                            Open institution →
                          </strong>
                        </div>
                      </article>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          @media (max-width: 900px) {
            .institutionalOverviewGrid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </section>
    </main>
  );
}
