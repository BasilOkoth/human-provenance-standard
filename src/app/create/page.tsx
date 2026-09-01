"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { getStoredPublicKey, signCanonicalWithCreatorKey } from "@/lib/hps/keyvault";

const contributionOptions = [
  "concept","research","reasoning","writing","composition","algorithm_design",
  "coding","editing","selection","curation","parameter_design","data_collection",
  "analysis","fact_checking","testing","final_approval"
];

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2,"0")).join("");
}

export default function CreatePage() {
  const supabase = createBrowserSupabase();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [publicKey, setPublicKey] = useState<string|null>(null);
  const [title,setTitle]=useState("");
  const [creatorName,setCreatorName]=useState("");
  const [workType,setWorkType]=useState("document");
  const [fileName,setFileName]=useState("");
  const [assetHash,setAssetHash]=useState("");
  const [contributions,setContributions]=useState<string[]>(["concept","final_approval"]);
  const [aiUsed,setAiUsed]=useState(false);
  const [primaryTool,setPrimaryTool]=useState("");
  const [processNote,setProcessNote]=useState("");
  const [keyPassphrase,setKeyPassphrase]=useState("");
  const [creating,setCreating]=useState(false);
  const [record,setRecord]=useState<any>(null);
  const [error,setError]=useState("");

  useEffect(()=>{(async()=>{
    const {data}=await supabase.auth.getUser();
    setUser(data.user);
    if(data.user){
      const r=await supabase.from("hps_profiles").select("*").eq("user_id",data.user.id).single();
      setProfile(r.data);
      setCreatorName(r.data?.display_name || data.user.email || "");
    }
    setPublicKey(getStoredPublicKey());
  })()},[]);

  const ready = useMemo(()=>Boolean(
    user && publicKey && title && creatorName && assetHash &&
    contributions.length && keyPassphrase
  ),[user,publicKey,title,creatorName,assetHash,contributions,keyPassphrase]);

  function toggle(v:string){setContributions(c=>c.includes(v)?c.filter(x=>x!==v):[...c,v])}
  async function onFile(file?:File){if(!file)return;setFileName(file.name);setAssetHash(await hashFile(file))}

  async function createRecord(){
    setError(""); setCreating(true); setRecord(null);
    try{
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user) throw new Error("Please sign in first.");
      if(!publicKey) throw new Error("Create your HPS creator signing key in Account first.");
      const processNoteHash=processNote?await hashText(processNote):null;
      const creatorClaim={
        title,creatorName,workType,fileName:fileName||undefined,assetHash,
        contributionTypes:contributions as any,aiUsed,
        primaryTool:primaryTool||null,processNoteHash,
        creatorPublicKey:publicKey,parentRecordId:null,issuedAt:new Date().toISOString()
      };
      const signed=await signCanonicalWithCreatorKey(creatorClaim,keyPassphrase);
      const response=await fetch("/api/records",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({creatorClaim,creatorSignature:signed.signature,processNote:processNote||undefined})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to create record.");setRecord(data);setKeyPassphrase("");
    }catch(e:any){setError(e.message||"Unable to create record.")}finally{setCreating(false)}
  }

  async function hashText(text:string){
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function downloadManifest(){
    if(!record?.manifest)return;
    const blob=new Blob([JSON.stringify(record.manifest,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`${record.id}.hps.json`;a.click();URL.revokeObjectURL(a.href)
  }

  if(!user) return <main className="pageShell"><Nav/><section className="pageHead shell">
    <p className="eyebrow">HPS CREATOR STUDIO</p><h1>Sign in to create provenance.</h1>
    <p>HPS 1.0 associates records with an authenticated creator identity and a canonical creator signature.</p>
    <Link className="button primary" href="/login">Sign in</Link>
  </section></main>;

  if(!publicKey) return <main className="pageShell"><Nav/><section className="pageHead shell">
    <p className="eyebrow">HPS CREATOR STUDIO</p><h1>Create your signing identity first.</h1>
    <p>Your creator-held key cryptographically signs your provenance declaration before HPS countersigns it.</p>
    <Link className="button primary" href="/account">Set up creator key</Link>
  </section></main>;

  return <main className="pageShell"><Nav/>
    <header className="pageHead shell"><p className="eyebrow">HPS CREATOR STUDIO · DUAL SIGNATURE</p>
      <h1>Sign your contribution.</h1>
      <p>You sign first with your encrypted creator key. HPS verifies your signature before creating a registry countersignature.</p>
    </header>

    <section className="panel">
      <div className="identityBanner">
        <div><span>IDENTITY</span><strong>{profile?.identity_assurance || "account_verified"}</strong></div>
        <div><span>CREATOR KEY</span><strong className="positive">✓ Present on device</strong></div>
      </div>

      <div className="formGrid">
        <div className="sectionLabel">01 · Work</div>
        <div className="field"><label>Title</label><input value={title} onChange={e=>setTitle(e.target.value)}/></div>
        <div className="field"><label>Creator</label><input value={creatorName} onChange={e=>setCreatorName(e.target.value)}/></div>
        <div className="field"><label>Type</label><select value={workType} onChange={e=>setWorkType(e.target.value)}>
          <option value="document">Document</option><option value="computational_art">Computational art</option>
          <option value="software">Software</option><option value="research">Research</option>
          <option value="photograph">Photograph</option><option value="design">Design</option>
          <option value="video">Video</option><option value="other">Other</option></select></div>
        <div className="field"><label>Original file</label><input type="file" onChange={e=>onFile(e.target.files?.[0])}/></div>
        {assetHash&&<div className="hashBox"><span>ASSET SHA-256</span><code>{assetHash}</code></div>}

        <div className="sectionLabel">02 · Human contribution</div>
        <div className="checks">{contributionOptions.map(v=><label className="check" key={v}>
          <input type="checkbox" checked={contributions.includes(v)} onChange={()=>toggle(v)}/>{v.replaceAll("_"," ")}</label>)}</div>

        <div className="sectionLabel">03 · Tools & evidence</div>
        <div className="field"><label>Generative AI used?</label><select value={aiUsed?"yes":"no"} onChange={e=>setAiUsed(e.target.value==="yes")}>
          <option value="no">No</option><option value="yes">Yes — disclose assistance</option></select></div>
        <div className="field"><label>Primary tool</label><input value={primaryTool} onChange={e=>setPrimaryTool(e.target.value)} placeholder="Python, ChatGPT, Photoshop…"/></div>
        <div className="field full"><label>Process evidence / note</label><textarea value={processNote} onChange={e=>setProcessNote(e.target.value)}/></div>

        <div className="sectionLabel">04 · Creator signature</div>
        <div className="field full"><label>Creator-key passphrase</label><input type="password" value={keyPassphrase} onChange={e=>setKeyPassphrase(e.target.value)} placeholder="Used only locally to unlock your encrypted signing key"/></div>
        <div className="field full"><button className="button primary" disabled={!ready||creating} onClick={createRecord}>
          {creating?"Verifying signature & countersigning…":"Sign & register HPS record"}</button></div>
      </div>

      {error&&<div className="errorBox">{error}</div>}
      {record&&<div className="successPanel"><p className="micro">DUAL-SIGNED & REGISTERED</p><h2>{record.id}</h2>
        <div className="verificationGrid">
          <div><span>Creator signature</span><strong className="positive">✓ Verified</strong></div>
          <div><span>Registry signature</span><strong className="positive">✓ Countersigned</strong></div>
          <div><span>Identity assurance</span><strong>{record.identityAssurance}</strong></div>
          <div><span>Asset fingerprint</span><strong className="positive">✓ Recorded</strong></div>
        </div>
        <div className="actions"><Link className="button primary" href={`/records/${record.id}`}>Open record</Link>
          <button className="button darkButton" onClick={downloadManifest}>Download manifest</button></div>
      </div>}
    </section>
  </main>
}