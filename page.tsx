export default function Home(){
  return <main>
    <section className="hero">
      <nav><strong>HPS</strong><span>Draft 0.1 · Open Standard</span></nav>
      <div className="heroCopy">
        <p className="eyebrow">HUMAN PROVENANCE STANDARD</p>
        <h1>Proof of human contribution.</h1>
        <p className="lede">An open standard for declaring, evidencing and verifying meaningful human contribution to digital and physical work in an AI-assisted world.</p>
      </div>
      <div className="card">
        <small>HPS RECORD</small>
        <h2>Human-led · AI-assisted</h2>
        <div><span>Creator</span><b>Basil Okoth Kaudo</b></div>
        <div><span>Human contribution</span><b>Concept · Algorithm design · Selection · Final approval</b></div>
        <div><span>Machine contribution</span><b>Computational rendering</b></div>
        <div><span>Integrity</span><b>Verified</b></div>
      </div>
    </section>

    <section className="section">
      <p className="eyebrow">WHY HPS</p>
      <h2>Authorship should be demonstrated through provenance, not guessed from polish.</h2>
      <div className="grid">
        <article><b>01</b><h3>Neutral toward AI</h3><p>HPS records contribution. It does not judge whether AI use is good or bad.</p></article>
        <article><b>02</b><h3>Evidence over assertion</h3><p>Claims can be backed by hashes, drafts, commits, renders and attestations.</p></article>
        <article><b>03</b><h3>Privacy by design</h3><p>Evidence can stay private while its cryptographic fingerprint remains verifiable.</p></article>
        <article><b>04</b><h3>Human + machine readable</h3><p>People see a clear provenance profile; software sees structured data.</p></article>
        <article><b>05</b><h3>Interoperable</h3><p>Designed to complement C2PA, verifiable credentials and modern trust infrastructure.</p></article>
        <article><b>06</b><h3>Responsibility</h3><p>Every record makes clear who stands behind the final work.</p></article>
      </div>
    </section>
  </main>
}
