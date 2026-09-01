import Link from "next/link";
import Nav from "@/components/Nav";
const records=[
{id:"HPS-2026-KE-000001",title:"Nebula I — Emergence",creator:"Basil Okoth Kaudo",profile:"Human-led · Computationally rendered",type:"Computational art"},
{id:"HPS-DEMO-SOFTWARE",title:"Reference Software Build",creator:"HPS Demo",profile:"Human-led · AI-assisted",type:"Software"},
{id:"HPS-DEMO-RESEARCH",title:"Research Provenance Example",creator:"HPS Demo",profile:"Human-led · AI-assisted",type:"Research"}
];
export default function Records(){return <main className="pageShell"><Nav/><header className="pageHead shell"><p className="eyebrow">PUBLIC REGISTRY · DEMONSTRATION</p><h1>Explore provenance records.</h1><p>This prototype demonstrates discoverable HPS records. Production use needs persistent storage and signed manifests.</p></header><section className="recordList">{records.map(r=><Link className="recordItem" href={`/records/${encodeURIComponent(r.id)}`} key={r.id}><small>{r.id} · {r.type}</small><h3>{r.title}</h3><p>{r.profile}</p><p>{r.creator}</p></Link>)}</section></main>}