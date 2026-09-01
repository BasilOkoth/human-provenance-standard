"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

const options=["concept","research","reasoning","writing","composition","algorithm_design","coding","editing","selection","curation","parameter_design","data_collection","analysis","fact_checking","testing","final_approval"];
function makeId(){return `HPS-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`}
async function hashFile(file:File){
  const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")
}

export default function Create(){
  const [recordId]=useState(makeId());
  const [title,setTitle]=useState(""); const [creator,setCreator]=useState("");
  const [workType,setWorkType]=useState("document"); const [hash,setHash]=useState("");
  const [fileName,setFileName]=useState(""); const [selected,setSelected]=useState<string[]>(["concept","final_approval"]);
  const [aiUsed,setAiUsed]=useState("no"); const [tool,setTool]=useState(""); const [note,setNote]=useState("");
  const [manifest,setManifest]=useState<any>(null);
  const canCreate=useMemo(()=>title&&creator&&hash&&selected.length>0,[title,creator,hash,selected]);

  async function onFile(f?:File){if(!f)return;setFileName(f.name);setHash(await hashFile(f))}
  function toggle(v:string){setSelected(s=>s.includes(v)?s.filter(x=>x!==v):[...s,v])}
  function create(){
    const now=new Date().toISOString();
    setManifest({
      hpsVersion:"0.1",id:recordId,
      work:{title,type:workType,createdAt:now,version:"1.0",sha256:hash,fileName},
      actors:[{id:"creator",name:creator,role:"creator",identityAssurance:"self_declared"}],
      contributions:selected.map(type=>({
        actorId:"creator",type,
        origin:type==="final_approval"?"human":aiUsed==="yes"?"ai_assisted":"human",
        description:`${creator} declares responsibility for ${type.replaceAll("_"," ")} in this work.`,
        evidenceIds:[],confidence:note?"evidence_backed":"self_declared"
      })),
      tools:tool?[{name:tool,role:"creation assistance",generativeAI:aiUsed==="yes",humanOversight:"high"}]:[],
      evidence:note?[{id:"evidence-note-1",type:"other",visibility:"public",sha256:"0".repeat(64),note}]:[],
      responsibility:{finalApprovalActorId:"creator",statement:"I confirm that this provenance record accurately describes my contribution and I accept responsibility for the final work."},
      issuedAt:now
    })
  }
  function download(){
    const blob=new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${recordId}.hps.json`;a.click()
  }

  return <main className="pageShell"><Nav/>
    <header className="pageHead shell"><p className="eyebrow">HPS CREATOR STUDIO</p><h1>Create a provenance record.</h1><p>Fingerprint the work locally, describe your contribution, disclose tool use and generate a portable HPS manifest.</p></header>
    <section className="panel">
      <div className="notice">Your source file is hashed inside your browser. This prototype does not upload the source file.</div>
      <div className="formGrid">
        <div className="sectionLabel">01 · Identify the work</div>
        <div className="field"><label>Work title</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Nebula I — Emergence"/></div>
        <div className="field"><label>Creator name</label><input value={creator} onChange={e=>setCreator(e.target.value)} placeholder="Your name or pseudonym"/></div>
        <div className="field"><label>Work type</label><select value={workType} onChange={e=>setWorkType(e.target.value)}><option>document</option><option>computational_art</option><option>software</option><option>research</option><option>photograph</option><option>design</option><option>video</option><option>other</option></select></div>
        <div className="field"><label>Source file</label><input type="file" onChange={e=>onFile(e.target.files?.[0])}/></div>
        {hash&&<div className="hashBox"><b>SHA-256</b><br/>{hash}</div>}

        <div className="sectionLabel">02 · Human contribution</div>
        <div className="checks">{options.map(v=><label className="check" key={v}><input type="checkbox" checked={selected.includes(v)} onChange={()=>toggle(v)}/>{v.replaceAll("_"," ")}</label>)}</div>

        <div className="sectionLabel">03 · Tools & AI disclosure</div>
        <div className="field"><label>Generative AI used?</label><select value={aiUsed} onChange={e=>setAiUsed(e.target.value)}><option value="no">No</option><option value="yes">Yes — disclosed</option></select></div>
        <div className="field"><label>Primary tool</label><input value={tool} onChange={e=>setTool(e.target.value)} placeholder="Python, ChatGPT, Photoshop, Figma…"/></div>
        <div className="field full"><label>Process evidence / note</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe drafts, commits, renders, notebooks, recordings or other evidence."/></div>

        <div className="sectionLabel">04 · Responsibility</div>
        <div className="field full"><button className="button primary" disabled={!canCreate} onClick={create}>Generate HPS manifest</button></div>
      </div>

      {manifest&&<div className="result">
        <p className="micro">RECORD CREATED · {recordId}</p><h2>{manifest.work.title}</h2>
        <pre>{JSON.stringify(manifest,null,2)}</pre>
        <div className="actions">
          <button className="button primary" onClick={download}>Download .hps.json</button>
          <Link className="button ghost" href={`/verify?demo=${encodeURIComponent(JSON.stringify(manifest))}`}>Verify manifest</Link>
        </div>
      </div>}
    </section>
  </main>
}