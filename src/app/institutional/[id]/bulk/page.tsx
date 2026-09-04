"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { getIssuerPublicKey, signIssuerClaim } from "@/lib/hps/issuer-keyvault";
import { fingerprintFile, type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";

type Item = {
  id: string;
  file: File;
  fileName: string;
  hash: string;
  fingerprint: HpsAssetFingerprintV1;
  title: string;
  documentType: string;
  subjectName: string;
  status: "checking"|"ready"|"same_org"|"other_org"|"related"|"issuing"|"issued"|"failed";
  message?: string;
  existing?: any[];
  relatedRecordId?: string;
  relationshipType?: string;
  hpsId?: string;
};

function titleFromName(name: string) {
  return name.replace(/\.[^.]+$/,"").replaceAll("_"," ").replaceAll("-"," ").trim();
}

function parseCsv(text: string) {
  const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(x => x.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(",").map(x => x.trim().replace(/^"|"$/g,""));
    const row: any = {};
    headers.forEach((h,i) => row[h] = values[i] || "");
    return row;
  });
}

export default function BulkPage({params}:{params:Promise<{id:string}>}) {
  const {id} = use(params);

  const [org,setOrg] = useState<any>(null);
  const [role,setRole] = useState("");
  const [pk,setPk] = useState<string|null>(null);
  const [keyId,setKeyId] = useState("");
  const [pass,setPass] = useState("");
  const [defaultType,setDefaultType] = useState("official_letter");
  const [items,setItems] = useState<Item[]>([]);
  const [csv,setCsv] = useState<any[]>([]);
  const [msg,setMsg] = useState("");
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/organizations");
      const d = await r.json();
      const row = (d.organizations || []).find((x:any) => x.hps_organizations?.id === id);
      setOrg(row?.hps_organizations || null);
      setRole(row?.role || "");

      const localPk = getIssuerPublicKey(id);
      setPk(localPk);

      if (localPk) {
        const kr = await fetch(`/api/organizations/${id}/keys`);
        if (kr.ok) {
          const kd = await kr.json();
          const match = (kd.keys || []).find((k:any) => k.public_key === localPk && k.status === "active");
          if (match) setKeyId(match.id);
        }
      }
    })();
  }, [id]);

  const counts = useMemo(() => {
    const c:any = {};
    items.forEach(i => c[i.status] = (c[i.status] || 0) + 1);
    return c;
  }, [items]);

  function metadata(fileName:string) {
    const row = csv.find((r:any) =>
      String(r.filename || r.file_name || "").toLowerCase() === fileName.toLowerCase()
    );
    return {
      title: row?.title || titleFromName(fileName),
      documentType: row?.document_type || row?.type || defaultType,
      subjectName: row?.subject_name || row?.subject || row?.recipient || ""
    };
  }

  async function prepareFile(file:File): Promise<Item> {
    const fingerprint = await fingerprintFile(file);
    const hash = fingerprint.exactSha256;
    const m = metadata(file.name);

    const base:Item = {
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      hash,
      fingerprint,
      title: m.title,
      documentType: m.documentType,
      subjectName: m.subjectName,
      status: "ready"
    };

    const r = await fetch(`/api/organizations/${id}/asset-check`, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({fingerprint})
    });
    if (!r.ok) return {...base,status:"failed",message:"Unable to check HPS registry."};

    const d = await r.json();

    if ((d.sameOrganization || []).length) {
      return {...base,status:"same_org",existing:d.sameOrganization,message:"Already registered by this institution."};
    }

    if ((d.otherOrganizations || []).length) {
      return {
        ...base,
        status:"other_org",
        existing:d.otherOrganizations,
        relatedRecordId:d.otherOrganizations[0]?.id || "",
        relationshipType:"",
        message:"Exact match exists under another institution. Declare relationship."
      };
    }

    const strongRelated = (d.relatedMatches || []).find((candidate:any) =>
      candidate.comparison?.status === "verified_derivative" ||
      (candidate.comparison?.status === "cross_format_match" && Number(candidate.comparison?.confidenceScore || 0) >= 75)
    );

    if (strongRelated) {
      return {
        ...base,
        status:"related",
        existing:[strongRelated],
        message:`Strong related provenance exists as ${strongRelated.id} (${strongRelated.comparison?.confidenceScore || 0}% confidence). Review it and register digitization, transcription, format conversion or a version instead of issuing a fresh original.`
      };
    }

    const ocrNote = fingerprint.ocr?.used
      ? ` OCR processed ${fingerprint.ocr.pagesProcessed} page(s).`
      : "";

    return {
      ...base,
      message:`No conflicting provenance found.${ocrNote}`
    };
  }

  async function addFiles(files?:FileList|null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg("Building resilient fingerprints… scanned files may take longer while OCR runs locally.");

    try {
      const prepared:Item[] = [];
      for (const f of Array.from(files)) prepared.push(await prepareFile(f));
      setItems(current => [...current,...prepared]);
      setMsg(`${prepared.length} document(s) fingerprinted and checked.`);
    } catch(e:any) {
      setMsg(e.message || "Unable to prepare files.");
    } finally {
      setBusy(false);
    }
  }

  async function loadCsv(file?:File) {
    if (!file) return;
    const rows = parseCsv(await file.text());
    setCsv(rows);
    setItems(current => current.map(item => {
      const row = rows.find((r:any) =>
        String(r.filename || r.file_name || "").toLowerCase() === item.fileName.toLowerCase()
      );
      if (!row) return item;
      return {
        ...item,
        title: row.title || item.title,
        documentType: row.document_type || row.type || item.documentType,
        subjectName: row.subject_name || row.subject || row.recipient || item.subjectName
      };
    }));
    setMsg(`${rows.length} CSV metadata row(s) loaded.`);
  }

  function updateItem(itemId:string, patch:Partial<Item>) {
    setItems(current => current.map(i => i.id === itemId ? {...i,...patch} : i));
  }

  async function issueOne(item:Item) {
    if (!org || !pk || !keyId) throw new Error("Active issuer key required.");

    if (item.status === "other_org" && (!item.relatedRecordId || !item.relationshipType)) {
      throw new Error("Choose relationship for existing institutional match.");
    }

    if (item.status === "related") {
      throw new Error("This document has strong related provenance and cannot be issued as a fresh original.");
    }

    const claim = {
      organizationId:id,
      organizationName:org.name,
      documentType:item.documentType,
      title:item.title,
      subjectName:item.subjectName || undefined,
      fileName:item.fileName,
      assetHash:item.hash,
      assetFingerprint:item.fingerprint,
      issuerPublicKey:pk,
      issuerKeyId:keyId,
      parentRecordId:null,
      issuedAt:new Date().toISOString()
    };

    const signed = await signIssuerClaim(id,claim,pass);

    const body:any = {
      institutionalClaim:claim,
      institutionSignature:signed.signature
    };

    if (item.status === "other_org") {
      body.assetRelationship = {
        relatedRecordId:item.relatedRecordId,
        relationshipType:item.relationshipType
      };
    }

    const r = await fetch(`/api/organizations/${id}/issue`, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(body)
    });

    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Unable to issue record.");
    return d.id as string;
  }

  async function issueBatch() {
    if (!pass) return setMsg("Enter issuer-key passphrase.");

    const ready = items.filter(i =>
      i.status === "ready" ||
      (i.status === "other_org" && i.relatedRecordId && i.relationshipType)
    );

    if (!ready.length) return setMsg("No documents are ready to issue.");

    setBusy(true);
    let ok = 0, failed = 0;

    for (const item of ready) {
      updateItem(item.id,{status:"issuing",message:"Signing and issuing..."});
      try {
        const hpsId = await issueOne(item);
        updateItem(item.id,{status:"issued",hpsId,message:"Issued successfully."});
        ok++;
      } catch(e:any) {
        updateItem(item.id,{status:"failed",message:e.message || "Issuance failed."});
        failed++;
      }
    }

    setPass("");
    setBusy(false);
    setMsg(`Bulk issuance complete: ${ok} issued, ${failed} failed.`);
  }

  function exportCsv() {
    const q = (v:any) => `"${String(v ?? "").replaceAll('"','""')}"`;
    const rows = [
      "filename,title,document_type,subject_name,sha256,status,hps_id,message",
      ...items.map(i => [
        i.fileName,i.title,i.documentType,i.subjectName,i.hash,i.status,i.hpsId || "",i.message || ""
      ].map(q).join(","))
    ];
    const blob = new Blob([rows.join("\n")],{type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hps-bulk-results-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!org) return <main className="pageShell"><Nav/><div className="loading">Loading institution…</div></main>;

  const readyCount = items.filter(i =>
    i.status === "ready" ||
    (i.status === "other_org" && i.relatedRecordId && i.relationshipType)
  ).length;

  return (
    <main className="pageShell">
      <Nav/>

      <header className="pageHead shell">
        <p className="eyebrow">HPS INSTITUTIONAL BULK ISSUANCE</p>
        <h1>{org.name}</h1>
        <p>One batch, many independently verifiable HPS records. Every file is fingerprinted, checked, signed and registered separately.</p>
        <div className="actions">
          <Link className="button darkButton" href={`/institutional/${id}`}>Single-document issuance</Link>
        </div>
      </header>

      <section className="panel">
        <div className="identityBanner">
          <div><span>INSTITUTION</span><strong>{org.verification_status}</strong></div>
          <div><span>ROLE</span><strong>{role}</strong></div>
          <div><span>ISSUER KEY</span><strong className={pk && keyId ? "positive":"negative"}>{pk && keyId ? "✓ Active":"✕ Not ready"}</strong></div>
        </div>

        <div className="formGrid">
          <div className="sectionLabel">01 · Upload</div>

          <div className="field">
            <label>Default document type</label>
            <input value={defaultType} onChange={e=>setDefaultType(e.target.value)}/>
          </div>

          <div className="field">
            <label>Select multiple documents</label>
            <input type="file" multiple disabled={busy} onChange={e=>{addFiles(e.target.files);e.currentTarget.value="";}}/>
          </div>

          <div className="field">
            <label>Optional metadata CSV</label>
            <input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{loadCsv(e.target.files?.[0]);e.currentTarget.value="";}}/>
          </div>

          <div className="field full">
            <p className="muted">CSV columns: <code>filename,title,document_type,subject_name</code>. Scanned PDFs and images are OCR-processed locally when needed.</p>
          </div>

          <div className="sectionLabel">02 · Review</div>

          <div className="verificationGrid">
            <div><span>Total</span><strong>{items.length}</strong></div>
            <div><span>Ready</span><strong className="positive">{counts.ready || 0}</strong></div>
            <div><span>Already registered here</span><strong>{counts.same_org || 0}</strong></div>
            <div><span>Other institution match</span><strong>{counts.other_org || 0}</strong></div>
            <div><span>Related provenance</span><strong>{counts.related || 0}</strong></div>
            <div><span>Issued</span><strong className="positive">{counts.issued || 0}</strong></div>
            <div><span>Failed</span><strong className={counts.failed ? "negative":""}>{counts.failed || 0}</strong></div>
          </div>

          {items.map(item => (
            <div className="field full" key={item.id}>
              <div className="hashBox">
                <span>{item.fileName} · {item.status.replaceAll("_"," ")}</span>
                <code>{item.hash}</code>

                <div className="formGrid" style={{marginTop:12}}>
                  <div className="field">
                    <label>Title</label>
                    <input value={item.title} disabled={item.status==="issued"||item.status==="issuing"} onChange={e=>updateItem(item.id,{title:e.target.value})}/>
                  </div>

                  <div className="field">
                    <label>Document type</label>
                    <input value={item.documentType} disabled={item.status==="issued"||item.status==="issuing"} onChange={e=>updateItem(item.id,{documentType:e.target.value})}/>
                  </div>

                  <div className="field">
                    <label>Subject / recipient</label>
                    <input value={item.subjectName} disabled={item.status==="issued"||item.status==="issuing"} onChange={e=>updateItem(item.id,{subjectName:e.target.value})}/>
                  </div>
                </div>

                {item.status === "other_org" && (
                  <div style={{marginTop:12}}>
                    <select value={item.relatedRecordId || ""} onChange={e=>updateItem(item.id,{relatedRecordId:e.target.value})}>
                      {(item.existing || []).map((x:any)=><option key={x.id} value={x.id}>{x.id} · {x.creator_name} · {x.title}</option>)}
                    </select>

                    <select style={{marginTop:8}} value={item.relationshipType || ""} onChange={e=>updateItem(item.id,{relationshipType:e.target.value})}>
                      <option value="">Choose relationship…</option>
                      <option value="co_issuer">Co-issuer</option>
                      <option value="co_signatory">Co-signatory</option>
                      <option value="attestor">Attestor</option>
                      <option value="endorser">Endorser</option>
                    </select>
                  </div>
                )}

                {item.status === "related" && item.existing?.[0] && (
                  <div className="notice" style={{marginTop:12}}>
                    <strong>Cross-format / derivative provenance detected</strong>
                    <p>{item.message}</p>
                    <div className="actions">
                      <Link className="button darkButton" href={`/records/${item.existing[0].id}`} target="_blank">Review existing record</Link>
                      <Link className="button darkButton" href="/verify/derivative" target="_blank">Register digitization / transcription</Link>
                    </div>
                  </div>
                )}

                {item.message && item.status !== "related" && <p className="muted">{item.message}</p>}
                {item.hpsId && <p><Link href={`/records/${item.hpsId}`}>{item.hpsId}</Link></p>}

                {item.status !== "issued" && (
                  <button className="button darkButton" type="button" onClick={()=>setItems(current=>current.filter(i=>i.id!==item.id))}>Remove</button>
                )}
              </div>
            </div>
          ))}

          <div className="sectionLabel">03 · Sign & issue</div>

          <div className="field full">
            <label>Authorized issuer-key passphrase</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)}/>
          </div>

          <div className="field full">
            <div className="actions">
              <button className="button primary" disabled={busy || !pass || !pk || !keyId || readyCount===0} onClick={issueBatch}>
                {busy ? "Processing bulk issuance..." : `Sign & issue ${readyCount} record(s)`}
              </button>
              <button className="button darkButton" disabled={!items.length} onClick={exportCsv}>Export results CSV</button>
            </div>
          </div>
        </div>

        {msg && <div className="accountMessage">{msg}</div>}

        <div className="notice" style={{marginTop:20}}>
          <strong>Bulk issuance rule</strong>
          <p>Each document gets its own HPS record, exact SHA-256, resilient fingerprint, institutional signature and registry countersignature. Strong cross-format matches are held for provenance review instead of being silently issued as new originals.</p>
        </div>
      </section>
    </main>
  );
}
