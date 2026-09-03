"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function BatchPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/batches/${id}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) return setError(d.error || "Unable to load batch.");
      setData(d);
    })();
  }, [id]);

  if (error) {
    return <main className="pageShell"><Nav/><section className="panel"><div className="accountMessage">{error}</div></section></main>;
  }

  if (!data) {
    return <main className="pageShell"><Nav/><div className="loading">Loading HPS batch…</div></main>;
  }

  const b = data.batch;
  const claim = b.claim;

  return (
    <main className="pageShell">
      <Nav/>

      <header className="pageHead shell">
        <p className="eyebrow">HPS INSTITUTIONAL BATCH</p>
        <h1>{b.id}</h1>
        <p>{claim.organizationName}</p>
      </header>

      <section className="panel">
        <div className="verificationGrid">
          <div><span>Submitted</span><strong>{b.submittedCount}</strong></div>
          <div><span>Issued</span><strong className="positive">{b.issuedCount}</strong></div>
          <div><span>Duplicates</span><strong>{b.duplicateCount}</strong></div>
          <div><span>Failed</span><strong className={b.failedCount ? "negative" : ""}>{b.failedCount}</strong></div>
          <div><span>Authorized issuer</span><strong className={data.integrity.institutionSignatureValid ? "positive":"negative"}>{data.integrity.institutionSignatureValid ? "✓ Verified":"✕ Invalid"}</strong></div>
          <div><span>Batch integrity</span><strong className={data.integrity.valid ? "positive":"negative"}>{data.integrity.valid ? "✓ Valid":"✕ Invalid"}</strong></div>
        </div>

        <div className="hashBox" style={{marginTop:20}}>
          <span>BATCH SHA-256</span>
          <code>{b.batchDigest}</code>
        </div>

        <div className="notice" style={{marginTop:20}}>
          <strong>What “Batch integrity valid” means</strong>
          <p>
            The stored batch claim still matches its SHA-256 digest, the authorized
            institution signature verifies, and the HPS Registry countersignature verifies.
            Each issued document remains independently verifiable through its own HPS record.
          </p>
        </div>

        <div style={{overflowX:"auto",marginTop:24}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
            <thead>
              <tr>
                <th align="left">File</th>
                <th align="left">Result</th>
                <th align="left">HPS record</th>
                <th align="left">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item:any,index:number) => (
                <tr key={`${item.asset_hash}-${index}`}>
                  <td style={{padding:"10px 8px"}}>{item.file_name}</td>
                  <td style={{padding:"10px 8px"}}>{item.result_status}</td>
                  <td style={{padding:"10px 8px"}}>
                    {item.hps_record_id ? <Link href={`/records/${item.hps_record_id}`}>{item.hps_record_id}</Link> : "—"}
                  </td>
                  <td style={{padding:"10px 8px"}}><code>{item.asset_hash.slice(0,20)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
