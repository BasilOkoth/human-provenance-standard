import Nav from "@/components/Nav";

export default function DocsPage() {
  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">
          HUMAN PROVENANCE STANDARD · CORE SPECIFICATION
        </p>

        <h1>Verifiable provenance for human and institutional contribution.</h1>

        <p>
          HPS defines an open provenance model for cryptographically declaring,
          evidencing and verifying contribution, identity assurance, institutional
          issuance and responsibility in digital work.
        </p>
      </header>

      <article className="docBody">
        <h2>Core principle</h2>

        <p>
          HPS does not attempt to determine whether content “looks human.”
          Instead, it records explicit provenance claims, machine assistance,
          supporting evidence, signatures and responsibility in a structured,
          auditable form.
        </p>

        <h2>Asset integrity</h2>

        <p>
          Every registered digital asset SHOULD be identified using a cryptographic
          fingerprint. The current reference implementation uses SHA-256 to verify
          exact file identity. A change to the file changes the fingerprint and
          therefore represents a different exact digital asset.
        </p>

        <h2>Creator signature</h2>

        <p>
          A creator SHOULD sign their provenance declaration using a
          creator-controlled Ed25519 signing key. The signature establishes that
          the holder of that private key approved the exact canonical declaration.
        </p>

        <h2>Institutional issuance</h2>

        <p>
          Verified organizations MAY authorize institutional issuer keys.
          Authorized issuers can cryptographically sign institutional records,
          including certificates, official letters, research outputs and other
          documents.
        </p>

        <p>
          Institutional records MAY be issued individually or in bulk. Each
          document MUST remain independently verifiable through its own asset
          fingerprint, institutional signature and HPS record.
        </p>

        <h2>Canonicalization</h2>

        <p>
          Cryptographically signed HPS objects SHOULD be canonicalized before
          signing. The reference implementation uses JSON Canonicalization Scheme
          style deterministic serialization so that signing and verification
          operate over the same structured representation.
        </p>

        <h2>Registry countersignature</h2>

        <p>
          The HPS Registry MAY verify a valid creator or institutional signature
          and countersign the accepted provenance record. The registry
          countersignature provides tamper evidence for the registered manifest.
        </p>

        <h2>Identity assurance</h2>

        <p>
          Cryptographic signatures and identity verification MUST remain separate
          trust signals. A valid signature proves control of a signing key; it
          does not automatically prove a person's civil identity or an
          organization's legal status.
        </p>

        <p>
          HPS SHOULD explicitly expose identity assurance levels such as
          self-declared, account verified, identity verified, institutionally
          attested, institution verified and authorized issuer verified.
        </p>

        <h2>Supporting evidence</h2>

        <p>
          Provenance claims MAY reference supporting evidence such as drafts,
          source code, research notes, datasets, notebooks, sketches, screenshots,
          version history and other relevant material.
        </p>

        <p>
          Evidence MAY be represented as public, hashed or sealed. Evidence-backed
          provenance means that supporting material exists and is linked to the
          claim; it does not mean that HPS independently proves every statement in
          that claim to be true.
        </p>

        <h2>Claims and verification</h2>

        <p>
          HPS MUST distinguish between what a creator or institution claims and
          what the system has actually verified.
        </p>

        <p>
          For example, a creator may claim that a writing contribution was human.
          HPS may verify the creator signature, asset fingerprint and associated
          evidence fingerprints. Those checks do not by themselves prove that
          every sentence was personally written without machine assistance.
        </p>

        <h2>Attestations</h2>

        <p>
          Independent people or institutions MAY add attestations concerning
          authorship, process observation, supervision, editorial review,
          employment role, institutional affiliation, document validity or other
          relevant claims.
        </p>

        <p>
          Attestations MUST remain distinguishable from the creator's or issuer's
          original provenance declaration.
        </p>

        <h2>Duplicate provenance</h2>

        <p>
          HPS SHOULD detect existing institutional registrations for the same
          exact asset fingerprint. An exact match from the same institution SHOULD
          normally be handled through versioning or supersession rather than
          silent duplicate issuance.
        </p>

        <p>
          Where another institution has registered the same exact asset, HPS MAY
          require an explicit relationship such as co-issuer, co-signatory,
          attestor or endorser.
        </p>

        <h2>Institutional batches</h2>

        <p>
          Bulk institutional issuance MAY produce a signed batch provenance
          object in addition to the individual HPS records.
        </p>

        <p>
          A batch record can identify the institution, authorized issuer,
          submitted documents, issued records, duplicates, failures and the
          cryptographic digest of the issuance event.
        </p>

        <p>
          Batch integrity MUST NOT replace individual record verification. Each
          successfully issued document remains independently verifiable.
        </p>

        <h2>Revocation and status</h2>

        <p>
          HPS records SHOULD preserve provenance history even when a record is
          disputed, superseded or revoked. Revocation SHOULD change the status of
          the provenance record rather than silently erase its history.
        </p>

        <h2>Key custody</h2>

        <p>
          The reference implementation encrypts creator and institutional secret
          keys locally using PBKDF2-derived AES-GCM encryption. Production
          institutional deployments SHOULD consider stronger key-management
          options such as hardware-backed signing, managed key infrastructure or
          hardware security modules where appropriate.
        </p>

        <h2>Interoperability</h2>

        <p>
          HPS is designed to complement, rather than replace, other provenance and
          identity technologies. Implementations MAY map HPS records to systems
          such as C2PA Content Credentials and Verifiable Credentials while
          preserving HPS-specific contribution and responsibility semantics.
        </p>

        <h2>Responsibility</h2>

        <p>
          Every HPS record SHOULD make clear who accepted final responsibility for
          the registered provenance declaration or institutional issuance.
        </p>
      </article>
    </main>
  );
}
