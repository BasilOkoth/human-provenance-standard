import Nav from "@/components/Nav";

export default function DocsPage(){return <main className="pageShell"><Nav/>
  <header className="pageHead shell"><p className="eyebrow">HPS CORE · DRAFT 0.4</p><h1>Identity-aware provenance.</h1>
    <p>HPS 0.4 adds creator-held signing, registry countersigning, authenticated identity assurance, attestations, record versioning and revocation.</p></header>
  <article className="docBody">
    <h2>Dual-signature principle</h2><p>The creator SHOULD sign the contribution declaration using a creator-controlled signing key. A registry MAY verify and countersign the accepted manifest.</p>
    <h2>Identity is separate</h2><p>A valid cryptographic signature proves possession of a key, not automatically a civil identity. HPS MUST display identity assurance separately.</p>
    <h2>Attestations</h2><p>Third parties MAY add claims such as authorship observation, supervision, editorial review, employment role or institutional affiliation. Attestations MUST remain separate from the creator’s original manifest.</p>
    <h2>Revocation</h2><p>Records SHOULD remain publicly discoverable after revocation so that provenance history is not silently erased.</p>
    <h2>Key custody</h2><p>This reference implementation encrypts creator secret keys locally using PBKDF2-derived AES-GCM keys. Production institutional deployments SHOULD consider hardware-backed or managed signing options.</p>
  </article>
</main>}