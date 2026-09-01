import Nav from "@/components/Nav";
export default function DevelopersPage(){return <main className="pageShell"><Nav/>
<header className="pageHead shell"><p className="eyebrow">HPS DEVELOPER PLATFORM</p><h1>Integrate identity-aware provenance.</h1></header>
<article className="docBody">
<h2>Create dual-signed record</h2><pre className="codeBox">{`POST /api/records
Authorization: Supabase session cookie

{
  "title": "Example",
  "assetHash": "<sha256>",
  "contributionTypes": ["concept","writing","final_approval"],
  "creatorPublicKey": "<base64>",
  "creatorSignature": "<base64>",
  "unsignedPayload": "<creator-signed payload>"
}`}</pre>
<h2>Add attestation</h2><pre className="codeBox">{`POST /api/records/{id}/attestations

{
  "claimType": "research_supervision",
  "statement": "I supervised the research process..."
}`}</pre>
<h2>Revoke</h2><pre className="codeBox">{`POST /api/records/{id}/revoke
{ "reason": "Superseded by corrected version." }`}</pre>
</article></main>}