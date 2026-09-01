"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";

export default function LoginPage() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function magicLink() {
    setBusy(true);
    setMessage("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/account`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });

    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
    setBusy(false);
  }

  async function github() {
    const redirectTo = `${window.location.origin}/auth/callback?next=/account`;
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo }
    });
  }

  return (
    <main className="pageShell">
      <Nav />
      <header className="pageHead shell">
        <p className="eyebrow">IDENTITY LAYER</p>
        <h1>Sign in to HPS.</h1>
        <p>Your account increases identity assurance and lets records be associated with a persistent creator profile.</p>
      </header>

      <section className="authCard">
        <button className="button githubButton" onClick={github}>Continue with GitHub</button>
        <div className="or"><span/>or<span/></div>
        <label>Email</label>
        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com"/>
        <button className="button primary" disabled={!email || busy} onClick={magicLink}>
          {busy ? "Sending…" : "Email secure sign-in link"}
        </button>
        {message && <p className="authMessage">{message}</p>}
      </section>
    </main>
  );
}
