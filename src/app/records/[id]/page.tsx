import Link from "next/link";
import Nav from "@/components/Nav";
import QRCode from "qrcode";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { HPSManifestSchema } from "@/lib/hps/schema";
import { verifyRegistrySignature } from "@/lib/hps/crypto";

export const dynamic="force-dynamic";

export default async function RecordPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  let data:any=null, attestations:any[]=[];
  let signatureValid=false, qr="";

  try{
    const admin=createAdminSupabase();
    const result=await admin.from("hps_records").select("*").eq("id",id).single();
    data=result.data;
    if(data){
      const m=HPSManifestSchema.parse(data.manifest);
      signatureValid=verifyRegistrySignature(m);
      const a=await admin.from("hps_attestations").select("*").eq("record_id",id).eq("status","active").order("created_at",{ascending:false});
      attestations=a.data||[];
      const base=process.env.NEXT_PUBLIC_APP_URL||"https://human-provenance-standard.onrender.com";
      qr=await QRCode.toDataURL(`${base}/records/${id}`,{width:320,margin:1,color:{dark:"#111111",light:"#f4f0e8"}});
    }
  }catch{}

  if(!data)return <main className="pageShell"><Nav/><header className="pageHead shell"><h1>Record not found.</h1></header></main>;

  const m=data.manifest;
  const actor=m.actors?.[0];
  const human=m.contributions.filter((c:any)=>c.origin==="human").map((c:any)=>c.type.replaceAll("_"," ")).join(" · ");
  const assisted=m.contributions.filter((c:any)=>c.origin==="ai_assisted").map((c:any)=>c.type.replaceAll("_"," ")).join(" · ");

  return <main className="pageShell"><Nav/>
    {data.status==="revoked"&&<div className="revocationBanner">REVOKED · {data.revocation_reason||"This record has been revoked by its owner."}</div>}
    <header className="recordHero shell"><div><p className="eyebrow">HPS DUAL-SIGNED PROVENANCE</p><h1>{data.title}</h1><p className="recordNumber">{id} · Version {data.version}</p></div>
      {qr&&<img className="qr" src={qr} alt={`QR for ${id}`}/>}</header>

    <section className="recordDetail">
      <div className="verificationGrid">
        <div><span>Creator signature</span><strong className={m.creatorSignature?"positive":"negative"}>{m.creatorSignature?"✓ Present":"✕ Missing"}</strong></div>
        <div><span>Registry signature</span><strong className={signatureValid?"positive":"negative"}>{signatureValid?"✓ Cryptographically valid":"✕ Invalid"}</strong></div>
        <div><span>Identity assurance</span><strong>{actor?.identityAssurance||"unknown"}</strong></div>
        <div><span>Attestations</span><strong>{attestations.length}</strong></div>
      </div>

      <dl className="recordFacts">
        <div><dt>Creator</dt><dd>{data.creator_name}</dd></div>
        <div><dt>Human contribution</dt><dd>{human||"None declared"}</dd></div>
        <div><dt>AI-assisted contribution</dt><dd>{assisted||"None declared"}</dd></div>
        <div><dt>Asset SHA-256</dt><dd><code>{data.asset_hash}</code></dd></div>
        <div><dt>Status</dt><dd>{data.status}</dd></div>
      </dl>

      <div className="sectionHeader"><div><p className="micro">INDEPENDENT CLAIMS</p><h2>Attestations</h2></div>
        <Link className="button darkButton" href={`/attest/${id}`}>Add attestation</Link></div>

      {attestations.length===0?<p className="muted">No third-party attestations yet.</p>:
        <div className="attestationList">{attestations.map(a=><article key={a.id}>
          <div><span>{a.claim_type.replaceAll("_"," ")}</span><strong>{a.assurance}</strong></div>
          <p>{a.statement}</p><footer>{a.attestor_name}{a.institution?` · ${a.institution}`:""}</footer>
        </article>)}</div>}

      <details className="manifestDetails"><summary>View signed manifest</summary><pre>{JSON.stringify(m,null,2)}</pre></details>
    </section>
  </main>
}