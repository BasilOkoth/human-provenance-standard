import Link from "next/link";
import Nav from "@/components/Nav";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic="force-dynamic";

export default async function RecordsPage(){
  let records:any[]=[];
  try{
    const admin=createAdminSupabase();
    const {data}=await admin.from("hps_records")
      .select("id,title,creator_name,work_type,version,status,created_at")
      .order("created_at",{ascending:false}).limit(50);
    records=data||[];
  }catch{}

  return <main className="pageShell"><Nav/>
    <header className="pageHead shell"><p className="eyebrow">HPS PUBLIC REGISTRY</p><h1>Signed provenance over time.</h1>
      <p>Records remain discoverable even when revoked, preserving an auditable provenance history.</p></header>
    <section className="recordList">
      {records.length===0&&<div className="emptyState"><h2>No records yet.</h2><Link className="button primary" href="/create">Create first record</Link></div>}
      {records.map(r=><Link className={`recordItem ${r.status==="revoked"?"revokedItem":""}`} href={`/records/${r.id}`} key={r.id}>
        <small>{r.id} · v{r.version}</small><h3>{r.title}</h3><p>{r.creator_name}</p>
        <span className={r.status==="active"?"activeBadge":"revokedBadge"}>{r.status}</span>
      </Link>)}
    </section>
  </main>
}