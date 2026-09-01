"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import Nav from "@/components/Nav";

export default function Verify(){
  const params=useSearchParams(); const [text,setText]=useState(""); const [result,setResult]=useState<any>(null);
  useEffect(()=>{const d=params.get("demo");if(d)setText(d)},[params]);
  async function verify(){
    try{
      const data=JSON.parse(text);
      const r=await fetch("/api/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
      setResult(await r.json())
    }catch{setResult({validSchema:false,error:"The input is not valid JSON."})}
  }
  return <main className="pageShell"><Nav/>
    <header className="pageHead shell"><p className="eyebrow">HPS VERIFIER</p><h1>Inspect the provenance.</h1><p>Paste an HPS manifest. HPS reports specific trust signals rather than a vague real/fake score.</p></header>
    <section className="verifyBox">
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste HPS JSON manifest…"/>
      <button className="button primary" onClick={verify}>Verify record</button>
      {result&&<div className="result"><h2 className={result.validSchema?"success":"error"}>{result.validSchema?"✓ Manifest structure valid":"✕ Verification failed"}</h2><pre>{JSON.stringify(result,null,2)}</pre></div>}
    </section>
  </main>
}