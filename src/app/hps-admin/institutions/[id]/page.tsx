"use client";
import { use,useEffect,useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function Page({params}:{params:Promise<{id:string}>}){
  const {id}=use(params); const [rows,setRows]=useState<any[]>([]); const [msg,setMsg]=useState("Loading evidence…");
  useEffect(()=>{(async()=>{const r=await fetch(`/api/hps-admin/organizations/${id}/evidence`,{cache:"no-store"});const d=await r.json();if(!r.ok){setMsg(d.error||"Unable to load evidence.");return;}setRows(d.evidence||[]);setMsg("");})();},[id]);
  return <main className="pageShell"><Nav/><header className="pageHead shell"><p className="eyebrow">HPS ADMINISTRATION</p><h1>Institution evidence review</h1><p><Link href="/hps-admin">← Back to verification queue</Link></p></header><section className="panel">
    {msg&&<div className="accountMessage">{msg}</div>}
    {!msg&&rows.length===0&&<div className="accountMessage">No verification evidence submitted.</div>}
    {rows.map((x:any)=><article key={x.id} style={{padding:"18px 0",borderBottom:"1px solid #e5e5e5"}}><p className="eyebrow">{x.evidence_type}</p><h3>{x.file_name}</h3>{x.registration_number&&<p>Registration/licence: <strong>{x.registration_number}</strong></p>}{x.note&&<p>{x.note}</p>}<p><code>SHA-256 {x.sha256}</code></p>{x.signedUrl&&<a className="button secondary" href={x.signedUrl} target="_blank" rel="noreferrer">Open private evidence</a>}</article>)}
  </section></main>;
}
