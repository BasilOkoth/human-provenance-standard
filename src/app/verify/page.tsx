"use client";

import { Suspense, useState } from "react";
import Nav from "@/components/Nav";

async function hashFile(file:File){
  const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function shortCode(id?:string){
  if(!id)return "";
  const parts=id.split("-");
  return parts[parts.length-1] || id;
}

function VerifyContent(){
  const [text,setText]=useState("");
  const [result,setResult]=useState<any>(null);
  const [asset,setAsset]=useState<any>(null);

  async function verify(){
    try{
      const r=await fetch("/api/verify",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:text
      });
      setResult(await r.json());
      setAsset(null);
    }catch{
      setResult({validSchema:false,error:"Invalid manifest."});
    }
  }

  async function verifyAsset(file?:File){
    if(!file||!result?.assetHash)return;
    const actual=await hashFile(file);
    setAsset({
      actual,
      matches:actual.toLowerCase()===result.assetHash.toLowerCase()
    });
  }

  const provenanceReady =
    Boolean(result?.validSchema) &&
    Boolean(result?.validRegistrySignature) &&
    Boolean(result?.creatorSignaturePresent);

  const fullyVerified = provenanceReady && asset?.matches === true;

  return <main className="pageShell"><Nav/>
    <header className="pageHead shell">
      <p className="eyebrow">HPS VERIFIER</p>
      <h1>Verify provenance.</h1>
      <p>Paste a signed HPS manifest, then upload the original file to confirm that its fingerprint matches the registered work.</p>
    </header>

    <section className="verifyBox">
      <textarea
        value={text}
        onChange={e=>setText(e.target.value)}
        placeholder="Paste signed HPS 0.4 manifest…"
      />

      <button className="button primary" disabled={!text.trim()} onClick={verify}>
        Verify provenance
      </button>

      {result&&<div className="result">
        <p className="micro">VERIFICATION RESULT</p>

        <div className="verificationGrid">
          <div><span>Schema</span><strong className={result.validSchema?"positive":"negative"}>{result.validSchema?"✓ Valid":"✕ Invalid"}</strong></div>
          <div><span>Creator signature</span><strong className={result.creatorSignaturePresent?"positive":"negative"}>{result.creatorSignaturePresent?"✓ Present":"✕ Missing"}</strong></div>
          <div><span>Registry signature</span><strong className={result.validRegistrySignature?"positive":"negative"}>{result.validRegistrySignature?"✓ Valid":"✕ Invalid"}</strong></div>
          <div><span>Identity assurance</span><strong>{result.identityStatus||"unknown"}</strong></div>
        </div>

        {result.validSchema&&<div className="assetVerifier">
          <p className="micro">ASSET RE-VERIFICATION</p>
          <h3>Upload the original file.</h3>
          <input type="file" onChange={e=>verifyAsset(e.target.files?.[0])}/>

          {asset&&<div className={asset.matches?"assetMatch":"assetMismatch"}>
            <strong>{asset.matches?"✓ Asset fingerprint matches":"✕ Asset fingerprint mismatch"}</strong>
            <code>{asset.actual}</code>
          </div>}
        </div>}

        {fullyVerified&&
          <a
            className="hpsCompactMark"
            href={`/records/${result.recordId}`}
            title="Open HPS provenance record"
          >
            <span className="hpsCompactLogo">HPS</span>
            <span className="hpsCompactCheck">✓</span>
            <span className="hpsCompactText">PROVENANCE VERIFIED</span>
            <code>{shortCode(result.recordId)}</code>
          </a>
        }

        {!fullyVerified && provenanceReady && asset?.matches !== false &&
          <div className="hpsRecordFound">
            HPS ? <code>{shortCode(result.recordId)}</code>
          </div>
        }

        <details>
          <summary>Technical data</summary>
          <pre>{JSON.stringify(result,null,2)}</pre>
        </details>
      </div>}
    </section>
  </main>
}

export default function VerifyPage(){
  return <Suspense fallback={<div className="loading">Loading verifier…</div>}>
    <VerifyContent/>
  </Suspense>
}
