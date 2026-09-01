import Link from "next/link";
import Nav from "@/components/Nav";

const pillars=[
  ["Human contribution","Make meaningful human work visible without pretending AI does not exist."],
  ["Evidence","Back authorship claims with hashes, drafts, commits, renders and attestations."],
  ["Integrity","Bind a record to the exact work using cryptographic fingerprints."],
  ["Responsibility","Show who stands behind the final output and accepts responsibility for it."]
];

export default function Home(){
  return <main>
    <section className="hero shell">
      <Nav/>
      <div className="heroGrid">
        <div className="heroCopy">
          <p className="eyebrow">HUMAN PROVENANCE STANDARD · DRAFT 0.1</p>
          <h1>Make human contribution <em>provable.</em></h1>
          <p className="lede">An open provenance standard for declaring, evidencing and verifying meaningful human contribution to digital and physical work in an AI-assisted world.</p>
          <div className="actions">
            <Link className="button primary" href="/create">Create a provenance record</Link>
            <Link className="button ghost" href="/verify">Verify a record</Link>
          </div>
          <div className="trustLine"><span>Open standard</span><span>SHA-256</span><span>Privacy-first</span><span>AI-neutral</span></div>
        </div>
        <div className="recordCard premiumCard">
          <div className="cardTop"><span className="status"><i/> HPS RECORD</span><span className="recordId">HPS-2026-KE-000001</span></div>
          <p className="micro">CONTRIBUTION PROFILE</p>
          <h2>Human-led<br/>Computationally rendered</h2>
          <dl>
            <div><dt>Creator</dt><dd>Basil Okoth Kaudo</dd></div>
            <div><dt>Human contribution</dt><dd>Concept · Algorithm design · Selection · Final approval</dd></div>
            <div><dt>Tool contribution</dt><dd>Python rendering</dd></div>
            <div><dt>Evidence</dt><dd>2 hashed process records</dd></div>
            <div><dt>Integrity</dt><dd className="gold">✓ Fingerprinted</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <section className="statement shell">
      <p className="eyebrow">THE PROBLEM</p>
      <h2>When exceptional work is dismissed as “just AI,” trust breaks down.</h2>
      <p className="statementBody">HPS changes the question from <strong>“Did AI make this?”</strong> to <strong>“What did the human contribute, what did tools contribute, and what evidence supports those claims?”</strong></p>
    </section>

    <section className="pillars shell">
      {pillars.map(([t,b],i)=><article key={t}><span>0{i+1}</span><h3>{t}</h3><p>{b}</p></article>)}
    </section>

    <section className="workflow shell">
      <div><p className="eyebrow">HOW IT WORKS</p><h2>From work to verifiable provenance in minutes.</h2></div>
      <ol>
        <li><b>01</b><div><h3>Fingerprint the work</h3><p>Your browser calculates a SHA-256 fingerprint locally.</p></div></li>
        <li><b>02</b><div><h3>Declare contribution</h3><p>Record human work, AI assistance, tools and evidence.</p></div></li>
        <li><b>03</b><div><h3>Create the manifest</h3><p>Generate a portable machine-readable provenance record.</p></div></li>
        <li><b>04</b><div><h3>Share and verify</h3><p>Use the manifest, HPS ID and public verification workflow.</p></div></li>
      </ol>
    </section>
  </main>
}