"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { getStoredPublicKey, signCanonicalWithCreatorKey } from "@/lib/hps/keyvault";
import { fingerprintFile, type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";

const contributionOptions = [
  "concept","research","reasoning","writing","composition","algorithm_design",
  "coding","editing","selection","curation","parameter_design","data_collection",
  "analysis","fact_checking","testing","final_approval"
];

type PreflightResult = {
  assetHash?: string;
  match?: boolean;
  matchMode?: string;
  records?: any[];
};

type PendingEvidence = {
  id: string;
  type: string;
  visibility: "hashed" | "sealed";
  file: File;
  sha256: string;
  note: string;
};

const DECLARATION =
  "I declare that the provenance and contribution information I have provided is accurate to the best of my knowledge. I understand that materially false or misleading claims may cause this HPS record to be disputed, suspended or revoked.";

export default function CreatePage() {
  const supabase = createBrowserSupabase();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [workType, setWorkType] = useState("document");
  const [fileName, setFileName] = useState("");
  const [assetHash, setAssetHash] = useState("");
  const [assetFingerprint, setAssetFingerprint] = useState<HpsAssetFingerprintV1 | null>(null);

  const [checkingAsset, setCheckingAsset] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  const [contributions, setContributions] = useState<string[]>(["concept","final_approval"]);
  const [aiUsed, setAiUsed] = useState(false);
  const [primaryTool, setPrimaryTool] = useState("");
  const [processNote, setProcessNote] = useState("");

  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidence[]>([]);
  const [evidenceType, setEvidenceType] = useState("draft");
  const [evidenceVisibility, setEvidenceVisibility] = useState<"hashed" | "sealed">("sealed");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [creating, setCreating] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);

      if (data.user) {
        const r = await supabase
          .from("hps_profiles")
          .select("*")
          .eq("user_id", data.user.id)
          .single();

        setProfile(r.data);
        setCreatorName(r.data?.display_name || data.user.email || "");
      }

      setPublicKey(getStoredPublicKey());
    })();
  }, []);

  const existingMatch = preflight?.records?.[0] || null;
  const assetBlocked = Boolean(preflight?.match && existingMatch);

  const ready = useMemo(() => Boolean(
    user &&
    publicKey &&
    title &&
    creatorName &&
    assetHash &&
    assetFingerprint &&
    contributions.length &&
    declarationAccepted &&
    keyPassphrase &&
    !checkingAsset &&
    !assetBlocked
  ), [
    user, publicKey, title, creatorName, assetHash, assetFingerprint,
    contributions, declarationAccepted, keyPassphrase, checkingAsset, assetBlocked
  ]);

  function toggle(v: string) {
    setContributions(current =>
      current.includes(v) ? current.filter(x => x !== v) : [...current, v]
    );
  }

  async function verifyFingerprint(fingerprint: HpsAssetFingerprintV1): Promise<PreflightResult> {
    const response = await fetch("/api/verify/asset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetHash: fingerprint.exactSha256,
        fingerprint
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to check the HPS registry.");
    return data;
  }

  async function onFile(file?: File) {
    if (!file) return;

    setError("");
    setRecord(null);
    setPreflight(null);
    setAssetFingerprint(null);
    setAssetHash("");
    setFileName(file.name);
    setCheckingAsset(true);

    try {
      const fingerprint = await fingerprintFile(file);
      setAssetFingerprint(fingerprint);
      setAssetHash(fingerprint.exactSha256);
      setPreflight(await verifyFingerprint(fingerprint));
    } catch (e: any) {
      setError(e.message || "Unable to fingerprint or check this file.");
    } finally {
      setCheckingAsset(false);
    }
  }

  async function hashFileSha256(file: File) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function addEvidence(file?: File) {
    if (!file) return;

    if (pendingEvidence.length >= 20) {
      setError("A maximum of 20 supporting evidence files may be attached.");
      return;
    }

    const sha256 = await hashFileSha256(file);
    const id = "ev_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);

    setPendingEvidence(current => [
      ...current,
      {
        id,
        type: evidenceType,
        visibility: evidenceVisibility,
        file,
        sha256,
        note: evidenceNote.trim()
      }
    ]);

    setEvidenceNote("");
  }

  function removeEvidence(id: string) {
    setPendingEvidence(current => current.filter(item => item.id !== id));
  }

  async function hashText(text: string) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function createRecord() {
    setError("");
    setCreating(true);
    setRecord(null);

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) throw new Error("Please sign in first.");
      if (!publicKey) throw new Error("Create your HPS creator signing key in Account first.");
      if (!assetFingerprint) throw new Error("Select and fingerprint the original file first.");
      if (!declarationAccepted) throw new Error("Accept the provenance declaration before signing.");

      const latestCheck = await verifyFingerprint(assetFingerprint);
      setPreflight(latestCheck);

      if (latestCheck.match && latestCheck.records?.length) {
        const match = latestCheck.records[0];
        const status = match.verificationClass || latestCheck.matchMode || "existing provenance";
        throw new Error(
          `Registration blocked. HPS detected ${status.replaceAll("_"," ")}. This asset must not be registered as a new independent original.`
        );
      }

      const processNoteHash = processNote ? await hashText(processNote) : null;

      const creatorClaim = {
        title,
        creatorName,
        workType,
        fileName: fileName || undefined,
        assetHash,
        assetFingerprint,
        contributionTypes: contributions as any,
        aiUsed,
        primaryTool: primaryTool || null,
        processNoteHash,
        supportingEvidence: pendingEvidence.map(item => ({
          id: item.id,
          type: item.type,
          visibility: item.visibility,
          fileName: item.file.name,
          sha256: item.sha256,
          note: item.note || undefined
        })),
        declaration: {
          version: "hps-creator-declaration-1",
          accepted: true,
          statement: DECLARATION,
          acceptedAt: new Date().toISOString()
        },
        creatorPublicKey: publicKey,
        parentRecordId: null,
        issuedAt: new Date().toISOString()
      };

      const signed = await signCanonicalWithCreatorKey(creatorClaim, keyPassphrase);

      if (signed.publicKey !== publicKey) {
        throw new Error("Creator signing key changed during registration.");
      }

      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorClaim,
          creatorSignature: signed.signature,
          processNote: processNote || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to create record.");
      }

      for (const item of pendingEvidence) {
        const form = new FormData();
        form.set("file", item.file);
        form.set("evidenceId", item.id);

        const evidenceResponse = await fetch(`/api/records/${data.id}/evidence`, {
          method: "POST",
          body: form
        });

        const evidenceResult = await evidenceResponse.json();

        if (!evidenceResponse.ok) {
          throw new Error(
            `Record ${data.id} was registered, but evidence ${item.file.name} could not be attached: ${evidenceResult.error || "upload failed"}`
          );
        }
      }

      setRecord(data);
      setKeyPassphrase("");
      setPendingEvidence([]);
      setDeclarationAccepted(false);
    } catch (e: any) {
      setError(e.message || "Unable to create record.");
    } finally {
      setCreating(false);
    }
  }

  function downloadManifest() {
    if (!record?.manifest) return;

    const blob = new Blob(
      [JSON.stringify(record.manifest, null, 2)],
      { type: "application/json" }
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${record.id}.hps.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!user) {
    return (
      <main className="pageShell">
        <Nav />
        <section className="pageHead shell">
          <p className="eyebrow">HPS CREATOR STUDIO</p>
          <h1>Sign in to create provenance.</h1>
          <p>
            HPS associates records with an authenticated creator identity,
            creator-held signing key and cryptographically registered asset fingerprint.
          </p>
          <Link className="button primary" href="/login">Sign in</Link>
        </section>
      </main>
    );
  }

  if (!publicKey) {
    return (
      <main className="pageShell">
        <Nav />
        <section className="pageHead shell">
          <p className="eyebrow">HPS CREATOR STUDIO</p>
          <h1>Create your signing identity first.</h1>
          <p>
            Your creator-held key cryptographically signs your provenance declaration
            before HPS countersigns it.
          </p>
          <Link className="button primary" href="/account">Set up creator key</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">
          HPS CREATOR STUDIO · COMPRESSION-RESILIENT PROVENANCE
        </p>
        <h1>Sign your contribution.</h1>
        <p>
          HPS fingerprints the file locally, checks the provenance registry for
          originals and related derivatives, then allows a new record only when no
          existing provenance relationship is detected.
        </p>
      </header>

      <section className="panel">
        <div className="identityBanner">
          <div>
            <span>IDENTITY</span>
            <strong>{profile?.identity_assurance || "account_verified"}</strong>
          </div>
          <div>
            <span>CREATOR KEY</span>
            <strong className="positive">✓ Present on device</strong>
          </div>
        </div>

        <div className="formGrid">
          <div className="sectionLabel">01 · Work</div>

          <div className="field">
            <label>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label>Creator</label>
            <input value={creatorName} onChange={e => setCreatorName(e.target.value)} />
          </div>

          <div className="field">
            <label>Type</label>
            <select value={workType} onChange={e => setWorkType(e.target.value)}>
              <option value="document">Document</option>
              <option value="computational_art">Computational art</option>
              <option value="software">Software</option>
              <option value="research">Research</option>
              <option value="photograph">Photograph</option>
              <option value="design">Design</option>
              <option value="video">Video</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label>Original file</label>
            <input type="file" onChange={e => onFile(e.target.files?.[0])} />
            {checkingAsset && (
              <p className="muted">Building HPS fingerprint and checking existing provenance…</p>
            )}
          </div>

          {assetHash && (
            <div className="hashBox">
              <span>ASSET SHA-256</span>
              <code>{assetHash}</code>
            </div>
          )}

          {assetFingerprint && (
            <div className="hashBox">
              <span>HPS FINGERPRINT</span>
              <code>{assetFingerprint.version} · {assetFingerprint.modality}</code>
            </div>
          )}

          {assetFingerprint?.canonicalTextSha256 && (
            <div className="hashBox">
              <span>CANONICAL CONTENT</span>
              <code>{assetFingerprint.canonicalTextSha256}</code>
            </div>
          )}

          {preflight && !preflight.match && (
            <div className="successPanel">
              <p className="micro">PRE-REGISTRATION CHECK</p>
              <h2>✓ No existing provenance relationship detected</h2>
              <p>
                HPS did not find an exact original, registered derivative or sufficiently
                strong transformation relationship.
              </p>
            </div>
          )}

          {preflight?.match && existingMatch && (
            <div className="errorBox">
              <strong>Registration blocked</strong>
              <p>HPS has already established provenance associated with this asset.</p>

              <p>
                Classification:{" "}
                <strong>
                  {(existingMatch.verificationClass || preflight.matchMode || "existing record")
                    .replaceAll("_"," ")
                    .toUpperCase()}
                </strong>
              </p>

              {existingMatch.title && (
                <p>Existing work: <strong>{existingMatch.title}</strong></p>
              )}

              {existingMatch.creatorName && (
                <p>Registered creator: <strong>{existingMatch.creatorName}</strong></p>
              )}

              {existingMatch.comparison?.reasons?.map((reason: string, i: number) => (
                <p key={i}>{reason}</p>
              ))}

              {existingMatch.id && (
                <div className="actions">
                  <Link className="button darkButton" href={`/records/${existingMatch.id}`}>
                    Open existing record
                  </Link>
                  <Link className="button darkButton" href="/verify/derivative">
                    Inspect relationship
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="sectionLabel">02 · Human contribution</div>

          <div className="checks">
            {contributionOptions.map(v => (
              <label className="check" key={v}>
                <input
                  type="checkbox"
                  checked={contributions.includes(v)}
                  onChange={() => toggle(v)}
                />
                {v.replaceAll("_"," ")}
              </label>
            ))}
          </div>

          <div className="sectionLabel">03 · Tools & evidence</div>

          <div className="field">
            <label>Generative AI used?</label>
            <select
              value={aiUsed ? "yes" : "no"}
              onChange={e => setAiUsed(e.target.value === "yes")}
            >
              <option value="no">No</option>
              <option value="yes">Yes — disclose assistance</option>
            </select>
          </div>

          <div className="field">
            <label>Primary tool</label>
            <input
              value={primaryTool}
              onChange={e => setPrimaryTool(e.target.value)}
              placeholder="Python, ChatGPT, Photoshop…"
            />
          </div>

          <div className="field full">
            <label>Process evidence / note</label>
            <textarea
              value={processNote}
              onChange={e => setProcessNote(e.target.value)}
              placeholder="Describe your process, decisions, revisions, tools and human oversight."
            />
          </div>

          <div className="field">
            <label>Supporting evidence type</label>
            <select value={evidenceType} onChange={e => setEvidenceType(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="source_code">Source code</option>
              <option value="version_history">Version history</option>
              <option value="research_notes">Research notes</option>
              <option value="sketch">Sketch</option>
              <option value="screenshot">Screenshot</option>
              <option value="dataset">Dataset</option>
              <option value="notebook">Notebook</option>
              <option value="ai_interaction">AI interaction / export</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label>Evidence visibility</label>
            <select
              value={evidenceVisibility}
              onChange={e => setEvidenceVisibility(e.target.value as "hashed" | "sealed")}
            >
              <option value="sealed">Sealed — file stored privately</option>
              <option value="hashed">Hash only — HPS stores fingerprint, not file</option>
            </select>
          </div>

          <div className="field">
            <label>Evidence description</label>
            <input
              value={evidenceNote}
              onChange={e => setEvidenceNote(e.target.value)}
              placeholder="e.g. First draft before final editing"
            />
          </div>

          <div className="field">
            <label>Add evidence file</label>
            <input
              type="file"
              onChange={e => {
                addEvidence(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {pendingEvidence.length > 0 && (
            <div className="field full">
              <strong>Evidence attached to signed claim</strong>
              <div style={{ marginTop: 10 }}>
                {pendingEvidence.map(item => (
                  <div
                    key={item.id}
                    className="hashBox"
                    style={{ marginBottom: 8 }}
                  >
                    <span>
                      {item.type.replaceAll("_"," ")} · {item.visibility}
                    </span>

                    <code>{item.file.name} · {item.sha256}</code>

                    {item.note && (
                      <p className="muted">{item.note}</p>
                    )}

                    <button
                      type="button"
                      className="button darkButton"
                      onClick={() => removeEvidence(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sectionLabel">04 · Provenance declaration</div>

          <div className="field full">
            <label className="check">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={e => setDeclarationAccepted(e.target.checked)}
              />
              <span>{DECLARATION}</span>
            </label>

            <p className="muted">
              Your acceptance is included inside the creator-signed HPS claim.
              HPS verifies the signed declaration and supporting evidence fingerprints;
              it does not guarantee that every factual statement made by a creator is true.
            </p>
          </div>

          <div className="sectionLabel">05 · Creator signature</div>

          <div className="field full">
            <label>Creator-key passphrase</label>
            <input
              type="password"
              value={keyPassphrase}
              onChange={e => setKeyPassphrase(e.target.value)}
              placeholder="Used only locally to unlock your encrypted signing key"
            />
          </div>

          <div className="field full">
            <button
              className="button primary"
              disabled={!ready || creating || assetBlocked}
              onClick={createRecord}
            >
              {creating
                ? "Checking provenance, verifying signature & countersigning…"
                : assetBlocked
                ? "Existing provenance detected"
                : "Sign & register HPS record"}
            </button>
          </div>
        </div>

        {error && <div className="errorBox">{error}</div>}

        {record && (
          <div className="successPanel">
            <p className="micro">DUAL-SIGNED & REGISTERED</p>
            <h2>{record.id}</h2>

            <div className="verificationGrid">
              <div>
                <span>Creator signature</span>
                <strong className="positive">✓ Verified</strong>
              </div>

              <div>
                <span>Registry signature</span>
                <strong className="positive">✓ Countersigned</strong>
              </div>

              <div>
                <span>Identity assurance</span>
                <strong>{record.identityAssurance}</strong>
              </div>

              <div>
                <span>Exact fingerprint</span>
                <strong className="positive">✓ SHA-256</strong>
              </div>

              <div>
                <span>HPS fingerprint</span>
                <strong className="positive">✓ v1</strong>
              </div>

              <div>
                <span>Creator declaration</span>
                <strong className="positive">✓ Signed</strong>
              </div>
            </div>

            <div className="actions">
              <Link className="button primary" href={`/records/${record.id}`}>
                Open record
              </Link>

              <button
                className="button darkButton"
                onClick={downloadManifest}
              >
                Download manifest
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
