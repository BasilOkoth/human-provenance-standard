import Link from "next/link";
import Nav from "@/components/Nav";

const trust = [
  ["Creator signature","Creator-held Ed25519 key signs the provenance declaration."],
  ["Registry signature","HPS countersigns the accepted manifest for tamper evidence."],
  ["Identity assurance","Account, identity and institutional assurance remain separate signals."],
  ["Attestation","Third parties can attest authorship, supervision, review or affiliation."]
];

export default function Home() {
  return (
    <main>
      <section className="hero shell">
        <Nav />
        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">HUMAN PROVENANCE STANDARD · DRAFT 0.4</p>
            <h1>Provenance with <em>identity and agency.</em></h1>
            <p className="lede">
              HPS 0.4 creates dual-signed provenance records: the creator signs their
              declaration, the registry verifies and countersigns it, and independent
              people or institutions can add attestations.
            </p>
            <div className="actions">
              <Link className="button primary" href="/create">Create signed record</Link>
              <Link className="button ghost" href="/login">Verify your account</Link>
            </div>
            <div className="trustLine">
              <span>Creator-held keys</span><span>Registry countersignature</span>
              <span>Identity assurance</span><span>Attestations</span><span>Revocation</span>
            </div>
          </div>

          <div className="recordCard">
            <p className="micro">HPS TRUST STACK</p>
            <h2>Not one badge.<br/>A chain of evidence.</h2>
            <div className="trustStack">
              <div><b>01</b><span>Asset fingerprint</span><strong>SHA-256</strong></div>
              <div><b>02</b><span>Creator signature</span><strong>Ed25519</strong></div>
              <div><b>03</b><span>Registry signature</span><strong>Ed25519</strong></div>
              <div><b>04</b><span>Identity assurance</span><strong>Account → Institution</strong></div>
              <div><b>05</b><span>Third-party attestations</span><strong>Independent claims</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="statement shell">
        <p className="eyebrow">WHY 0.4 MATTERS</p>
        <h2>A registry should not be the sole author of trust.</h2>
        <p className="statementBody">
          The creator signs first. HPS verifies that signature and only then countersigns
          the record. The registry can prove what it accepted; the creator remains the
          cryptographic source of the contribution declaration.
        </p>
      </section>

      <section className="pillars shell">
        {trust.map(([t,b],i)=><article key={t}><span>0{i+1}</span><h3>{t}</h3><p>{b}</p></article>)}
      </section>
    </main>
  );
}
