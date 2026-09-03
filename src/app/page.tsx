import Link from "next/link";
import Nav from "@/components/Nav";

const trust = [
  [
    "Creator signature",
    "The creator's locally held Ed25519 key signs the provenance declaration before it reaches the registry."
  ],
  [
    "Institutional issuance",
    "Verified organizations can authorize issuer keys and issue independently verifiable records, individually or in bulk."
  ],
  [
    "Registry signature",
    "HPS verifies the submitted signature and countersigns the accepted provenance manifest for tamper evidence."
  ],
  [
    "Evidence",
    "Claims can be linked to hashed or sealed supporting material such as drafts, source code, notes, datasets and version history."
  ],
  [
    "Independent attestations",
    "People and institutions can add signed attestations without replacing or rewriting the original provenance declaration."
  ]
];

export default function Home() {
  return (
    <main>
      <section className="hero shell">
        <Nav />

        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">
              HUMAN PROVENANCE STANDARD · OPEN PROVENANCE INFRASTRUCTURE
            </p>

            <h1>
              Provenance with{" "}
              <em>identity, evidence and accountability.</em>
            </h1>

            <p className="lede">
              HPS creates cryptographically verifiable provenance records for
              human and institutional contribution. Creators sign their own
              declarations, authorized institutions sign the records they issue,
              and HPS verifies and countersigns the resulting provenance record.
            </p>

            <div className="actions">
              <Link className="button primary" href="/create">
                Create provenance record
              </Link>

              <Link className="button ghost" href="/verify">
                Verify a record
              </Link>
            </div>

            <div className="trustLine">
              <span>Creator-held keys</span>
              <span>Institutional issuers</span>
              <span>Registry countersignatures</span>
              <span>Evidence</span>
              <span>Attestations</span>
              <span>Revocation</span>
            </div>
          </div>

          <div className="recordCard">
            <p className="micro">HPS TRUST STACK</p>

            <h2>
              Trust is not a badge.
              <br />
              It is a verifiable chain.
            </h2>

            <div className="trustStack">
              <div>
                <b>01</b>
                <span>Asset integrity</span>
                <strong>SHA-256</strong>
              </div>

              <div>
                <b>02</b>
                <span>Creator or issuer signature</span>
                <strong>Ed25519</strong>
              </div>

              <div>
                <b>03</b>
                <span>Registry countersignature</span>
                <strong>Ed25519</strong>
              </div>

              <div>
                <b>04</b>
                <span>Identity assurance</span>
                <strong>Self-declared → Institution</strong>
              </div>

              <div>
                <b>05</b>
                <span>Supporting evidence</span>
                <strong>Hashed · Sealed · Referenced</strong>
              </div>

              <div>
                <b>06</b>
                <span>Independent attestations</span>
                <strong>Third-party claims</strong>
              </div>

              <div>
                <b>07</b>
                <span>Status & accountability</span>
                <strong>Active · Disputed · Revoked</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="statement shell">
        <p className="eyebrow">WHY HPS MATTERS</p>

        <h2>No single party should be the sole author of trust.</h2>

        <p className="statementBody">
          HPS is designed so that the registry does not simply declare a work
          trustworthy. The creator or authorized institutional issuer signs
          first. HPS verifies that signature and countersigns the provenance
          record, keeping separate what was claimed, what evidence supports it,
          and what HPS actually verified.
        </p>
      </section>

      <section className="statement shell">
        <p className="eyebrow">THE HPS PRINCIPLE</p>

        <h2>HPS does not guess whether something looks human.</h2>

        <p className="statementBody">
          It makes human contribution, machine assistance, supporting evidence
          and responsibility explicit, attributable and verifiable.
        </p>
      </section>

      <section className="pillars shell">
        {trust.map(([title, body], index) => (
          <article key={title}>
            <span>0{index + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="statement shell">
        <p className="eyebrow">BUILT FOR</p>

        <h2>Creators. Institutions. Verifiers.</h2>

        <p className="statementBody">
          Register contribution provenance, issue institutional records at
          scale, or verify the integrity and signatures behind an HPS record.
        </p>

        <div className="actions">
          <Link className="button primary" href="/create">
            For creators
          </Link>

          <Link className="button ghost" href="/institutional">
            For institutions
          </Link>

          <Link className="button ghost" href="/verify">
            Verify provenance
          </Link>
        </div>
      </section>
    </main>
  );
}
