"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "hps.trustedResearchAgent.session.v4";

type BrowserEvent = {
  id: string;
  type: "source" | "ai" | "review" | "checkpoint";
  at: string;
  title: string;
  detail?: string;
  url?: string;
  reviewed?: boolean;
  reviewedAt?: string;
  relatedEventId?: string;
};

type BrowserTrail = {
  hpsType: "browser-research-trail";
  hpsVersion: string;
  events: BrowserEvent[];
  disclosure?: {
    captureMode?: string;
    hiddenBrowsingCaptured?: boolean;
    keystrokesCaptured?: boolean;
  };
};

function base64UrlToUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function BrowserImportPage() {
  const [state, setState] = useState<"importing" | "done" | "error">("importing");
  const [message, setMessage] = useState("Importing your browser provenance trail…");

  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const encoded = params.get("trail");
      if (!encoded) throw new Error("No browser trail was supplied.");

      const trail = JSON.parse(base64UrlToUtf8(encoded)) as BrowserTrail;
      if (trail.hpsType !== "browser-research-trail" || !Array.isArray(trail.events)) {
        throw new Error("The browser trail is not a recognized HPS research trail.");
      }

      const now = new Date().toISOString();
      const session = {
        version: "hps-research-session/0.4",
        id: uid("session"),
        title: "Browser-assisted research session",
        startedAt: trail.events[0]?.at || now,
        updatedAt: now,
        events: trail.events.map((event) => ({
          id: event.id || uid(event.type || "browser"),
          type: event.type,
          at: event.at || now,
          title: event.title || "Imported browser event",
          detail: [
            event.detail,
            event.relatedEventId ? `Related browser event: ${event.relatedEventId}.` : "",
            event.reviewedAt ? `Human review recorded at ${event.reviewedAt}.` : ""
          ].filter(Boolean).join(" "),
          url: event.url,
          reviewed: Boolean(event.reviewed)
        }))
      };

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setState("done");
      setMessage(`${trail.events.length} browser provenance event${trail.events.length === 1 ? "" : "s"} imported into HPS.`);
      window.history.replaceState(null, "", "/research-agent/browser-import");
      window.setTimeout(() => window.location.replace("/research-agent"), 700);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The browser trail could not be imported.");
    }
  }, []);

  return (
    <main className="shell" style={{ paddingTop: 64, paddingBottom: 80 }}>
      <p className="eyebrow">HPS BROWSER BRIDGE</p>
      <h1>{state === "error" ? "Import needs attention" : "Connecting browser provenance to HPS"}</h1>
      <p style={{ maxWidth: 720, opacity: 0.75 }}>{message}</p>
      <p style={{ maxWidth: 720, opacity: 0.65, fontSize: 13 }}>
        The trail is carried in the URL fragment and processed in your browser. The fragment is not sent to the HPS server as part of the HTTP request.
      </p>
      {state === "error" && (
        <Link className="button primary" href="/research-agent">Open Research Agent</Link>
      )}
    </main>
  );
}
