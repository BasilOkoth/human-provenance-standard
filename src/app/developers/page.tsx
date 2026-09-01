import Nav from "@/components/Nav";
export default function Developers(){
 const example=`POST /api/verify
Content-Type: application/json

{
  "hpsVersion":"0.1",
  "id":"HPS-...",
  "work":{...},
  "actors":[...],
  "contributions":[...]
}`;
 return <main className="pageShell"><Nav/><header className="pageHead shell"><p className="eyebrow">HPS FOR DEVELOPERS</p><h1>Build provenance into products.</h1><p>Use the manifest vocabulary and verifier API to integrate HPS into creator tools, academic systems, media workflows and software platforms.</p></header><article className="docBody"><h2>Verify API</h2><pre className="codeBox">{example}</pre><h2>Design rule</h2><p>Do not collapse HPS trust signals into a single authenticity percentage. Schema integrity, signer validity, identity assurance and evidence strength are separate facts.</p></article></main>
}