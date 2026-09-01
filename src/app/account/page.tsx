"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import {
  createEncryptedCreatorKey, getStoredPublicKey,
  exportEncryptedKeyFile, importEncryptedKeyFile
} from "@/lib/hps/keyvault";

export default function AccountPage() {
  const supabase = createBrowserSupabase();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [institution, setInstitution] = useState("");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async()=>{
      const { data } = await supabase.auth.getUser();
      setUser(data.user);

      if (data.user) {
        const result = await supabase.from("hps_profiles")
          .select("*").eq("user_id", data.user.id).single();
        setProfile(result.data);
        setDisplayName(result.data?.display_name || "");
        setInstitution(result.data?.institution || "");
      }
      setPublicKey(getStoredPublicKey());
    })();
  }, []);

  async function saveProfile(keyOverride?: string) {
    if (!user) return;
    const pk = keyOverride ?? publicKey;

    const { error } = await supabase.from("hps_profiles").upsert({
      user_id: user.id,
      display_name: displayName || user.email,
      institution: institution || null,
      public_key: pk,
      identity_assurance: "account_verified"
    });

    setMessage(error ? error.message : "Profile updated.");
  }

  async function generateKey() {
    if (passphrase.length < 10) {
      setMessage("Use a creator-key passphrase of at least 10 characters.");
      return;
    }

    try {
      const key = await createEncryptedCreatorKey(passphrase);
      setPublicKey(key);
      await saveProfile(key);
      setMessage("Creator signing key generated and encrypted on this device.");
      setPassphrase("");
    } catch (e:any) {
      setMessage(e.message);
    }
  }

  function exportKey() {
    try {
      const raw = exportEncryptedKeyFile();
      const blob = new Blob([raw], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hps-creator-key.encrypted.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch(e:any){ setMessage(e.message); }
  }

  async function importKey(file?: File) {
    if (!file) return;
    try {
      const key = importEncryptedKeyFile(await file.text());
      setPublicKey(key);
      await saveProfile(key);
      setMessage("Encrypted creator key imported on this device.");
    } catch(e:any){ setMessage(e.message); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    location.href="/";
  }

  if (!user) {
    return <main className="pageShell"><Nav/><section className="pageHead shell">
      <p className="eyebrow">HPS ACCOUNT</p><h1>Sign in required.</h1>
      <Link className="button primary" href="/login">Sign in</Link>
    </section></main>
  }

  return (
    <main className="pageShell">
      <Nav />
      <header className="pageHead shell">
        <p className="eyebrow">CREATOR IDENTITY</p>
        <h1>Your HPS identity.</h1>
        <p>Account verification and cryptographic signing are separate layers. Your secret creator key remains encrypted on your device.</p>
      </header>

      <section className="accountGrid">
        <div className="accountCard">
          <p className="micro">ACCOUNT</p>
          <h2>{profile?.identity_assurance === "account_verified" ? "Account verified" : "Signed in"}</h2>
          <div className="field"><label>Display name</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></div>
          <div className="field"><label>Institution</label><input value={institution} onChange={e=>setInstitution(e.target.value)} placeholder="Optional"/></div>
          <button className="button primary" onClick={()=>saveProfile()}>Save profile</button>
        </div>

        <div className="accountCard darkAccount">
          <p className="micro">CREATOR SIGNING KEY</p>
          <h2>{publicKey ? "Key active" : "Create your creator key"}</h2>
          {publicKey ? <>
            <p>Your public signing key:</p><code className="publicKey">{publicKey}</code>
            <div className="actions"><button className="button primary" onClick={exportKey}>Backup encrypted key</button></div>
            <div className="field importField"><label>Import encrypted backup</label><input type="file" accept=".json" onChange={e=>importKey(e.target.files?.[0])}/></div>
          </> : <>
            <p>Choose a passphrase. It encrypts your creator signing key locally using PBKDF2 + AES-GCM.</p>
            <div className="field"><label>Creator-key passphrase</label><input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></div>
            <button className="button primary" onClick={generateKey}>Generate encrypted creator key</button>
          </>}
        </div>
      </section>

      {message && <div className="accountMessage">{message}</div>}
      <div className="accountFooter"><button className="textButton" onClick={signOut}>Sign out</button></div>
    </main>
  );
}
