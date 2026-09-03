"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function AdminDisputesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/hps-admin/disputes");
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to load disputes.");
    setItems(data.disputes || []);
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="pageShell">
      <Nav />
      <header className="pageHead shell">
        <p className="eyebrow">HPS TRUST OPERATIONS</p>
        <h1>Provenance disputes.</h1>
        <p>Review challenges, inspect private files, request more evidence and record outcomes.</p>
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
                  Record: <Link href={`/records/${d.record_id}`}>{d.record_id}</Link>
                  {" · "}{new Date(d.created_at).toLocaleString()}
                </footer>
                <div className="actions" style={{ marginTop: 14 }}>
                  <Link className="button primary" href={`/hps-admin/disputes/${d.id}`}>
                    Open review workspace
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
