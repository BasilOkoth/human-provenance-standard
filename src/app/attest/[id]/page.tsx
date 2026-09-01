"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";

export default function AttestPage(){
  const params=useParams<{id:string}>();
  const [claimType,setClaimType]=useState("authorship");
  const [institution,setInstitution]=useState("");
  const [statement,setStatement]=useState("");
  const [message,setMessage]=useState("");

  async function submit(){
    const r=await fetch(`/api/records/${params.id}/attestations`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({claimType,institution:institution||undefined,statement})
    });
    const data=await r.json();
    setMessage(r.ok?"Attestation added to the provenance record.":data.error||"Unable to attest.");
  }

  return <main className="pageShell"><Nav/>
    <header className="pageHead shell"><p className="eyebrow">THIRD-PARTY ATTESTATION</p><h1>Add independent evidence.</h1>
      <p>Attestations do not rewrite the creator’s manifest. They add a separate signed-in person’s claim to the public provenance trail.</p></header>
    <section className="authCard wideCard">
      <div className="field"><label>Claim type</label><select value={claimType} onChange={e=>setClaimType(e.target.value)}>
        <option value="authorship">Authorship</option><option value="process_observed">Process observed</option>
        <option value="employment_role">Employment role</option><option value="institutional_affiliation">Institutional affiliation</option>
        <option value="research_supervision">Research supervision</option><option value="editorial_review">Editorial review</option>
        <option value="other">Other</option></select></div>
      <div className="field"><label>Institution</label><input value={institution} onChange={e=>setInstitution(e.target.value)} placeholder="Optional"/></div>
      <div className="field"><label>Statement</label><textarea value={statement} onChange={e=>setStatement(e.target.value)} placeholder="State exactly what you can attest to."/></div>
      <button className="button primary" disabled={statement.length<10} onClick={submit}>Publish attestation</button>
      {message&&<p>{message}</p>}
    </section>
  </main>
}