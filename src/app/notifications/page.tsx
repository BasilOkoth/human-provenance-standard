"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/notifications");
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to load notifications.");
    setItems(data.notifications || []);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", notificationId: id }),
    });
    await load();
  }

  return (
    <main className="pageShell">
      <Nav />
      <header className="pageHead shell">
        <p className="eyebrow">HPS ACCOUNT</p>
        <h1>Notifications.</h1>
        <p>Challenges, evidence requests and dispute outcomes appear here.</p>
      </header>

      <section className="recordDetail">
        {message && <div className="notice">{message}</div>}
        {items.length === 0 ? (
          <p className="muted">No notifications yet.</p>
        ) : (
          <div className="attestationList">
            {items.map((item) => (
              <article key={item.id}>
                <div>
                  <span>{String(item.notification_type).replaceAll("_", " ")}</span>
                  <strong>{item.read_at ? "READ" : "NEW"}</strong>
                </div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <footer>{new Date(item.created_at).toLocaleString()}</footer>
                {item.href && (
                  <div className="actions" style={{ marginTop: 12 }}>
                    <Link className="button primary" href={item.href} onClick={() => markRead(item.id)}>
                      Open
                    </Link>
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
