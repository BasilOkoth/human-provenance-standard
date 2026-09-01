"use client";
import { Suspense,useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

async function hashFile(file:File){const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")}
const shortCode=(id?:string)=>id?.split("-").pop()||"";

function VerifyContent(){
  const [fileResult,setFileResult]=useState<any>(null),[busy,setBusy]=useState(false),[manifestText,setManifestText]=useState(""),[manifestResult,setManifestResult]=useState<any>(null);
  async function verifyFile(file?:File){if(!file)return;setBusy(true);try{const assetHash=await hashFile(file);const r=await fetch("/api/verify/asset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({assetHash})});setFileResult({...await r.json(),fileName:file.name})}finally{setBusy(false)}}
  async function verifyManifest(){try{const r=await fetch("/api/verify",{method:"POST",headers:{"content-type":"application/json"},body:manifestText});setManifestResult(await r.json())}catch{setManifestResult({validSchema:false,error:"Invalid manifest."})}}
  const best=fileResult?.records?.find((r:any)=>r.status==="active"&&r.validRegistrySignature&&(r.creatorSignatureValid||r.institutionSignatureValid))||fileResult?.records?.[0];
  const bestTrusted=Boolean(best&&best.status==="active"&&best.validRegistrySignature&&(best.creatorSignatureValid||best.institutionSignatureValid));
  return <main className="pageShell"><Nav/>
    <header className="pageHead shell"><p className="eyebrow">HPS VERIFY</p><h1>Check the file in front of you.</h1><p>Upload a document, image or other digital asset. HPS calculates its SHA-256 fingerprint locally and checks for an exact registered match.</p></header>
    <section className="verifyBox">
      <div className="fileDrop"><p className="micro">DIRECT FILE VERIFICATION</p><h2>Upload the file.</h2><input type="file" onChange={e=>verifyFile(e.target.files?.[0])}/>{busy&&<p className="muted">Calculating fingerprint…</p>}</div>
      {fileResult&&<div className="result">
        {best?<><a className={bestTrusted?"hpsCompactMark":"hpsCompactMark hpsCompactMarkWarning"} href={`/records/${best.id}`}>
          <span className="hpsCompactLogo">HPS</span><span className="hpsCompactCheck">{bestTrusted?"✓":"!"}</span><span className="hpsCompactText">{bestTrusted?"PROVENANCE VERIFIED":"RECORD REQUIRES ATTENTION"}</span><code>{shortCode(best.id)}</code>
        </a><div className="verificationGrid"><div><span>Asset fingerprint</span><strong className="positive">✓ Exact match</strong></div><div><span>Registry signature</span><strong className={best.validRegistrySignature?"positive":"negative"}>{best.validRegistrySignature?"✓ Valid":"✕ Invalid"}</strong></div><div><span>Issuer/creator signature</span><strong className={(best.creatorSignatureValid||best.institutionSignatureValid)?"positive":"negative"}>{best.creatorSignatureValid||best.institutionSignatureValid?"✓ Valid":"✕ Not independently valid"}</strong></div><div><span>Status</span><strong>{best.status}</strong></div></div><Link className="button primary" href={`/records/${best.id}`}>Open provenance record</Link></>:<><h2>No HPS match found.</h2><p>This file does not currently match an asset fingerprint in the HPS registry. HPS is not claiming the file is fake; only that no matching registered record was found.</p></>}
        <details><summary>Technical data</summary><pre>{JSON.stringify(fileResult,null,2)}</pre></details>
      </div>}
      <details className="advancedVerify"><summary>Advanced · verify a signed manifest directly</summary><textarea value={manifestText} onChange={e=>setManifestText(e.target.value)} placeholder="Paste signed HPS manifest JSON…"/><button className="button darkButton" disabled={!manifestText.trim()} onClick={verifyManifest}>Verify manifest</button>{manifestResult&&<pre className="codeBox">{JSON.stringify(manifestResult,null,2)}</pre>}</details>
    </section>
  </main>
}
export default function VerifyPage(){return <Suspense fallback={<div className="loading">Loading verifier…</div>}><VerifyContent/></Suspense>}
