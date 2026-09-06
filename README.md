# Human Provenance Standard (HPS)

**Open provenance infrastructure for identity, evidence, accountability and verifiable contribution.**

HPS creates cryptographically verifiable provenance records for human and institutional contribution. Creators sign their own declarations, authorized institutions can issue records, and HPS verifies and countersigns accepted provenance records.

HPS does not try to guess whether something “looks human.” It records what was claimed, what evidence supports it, what machine assistance was used, who reviewed it, and who ultimately accepted responsibility.

## Trust stack

HPS currently supports:

- **Creator signatures** — locally held Ed25519 keys sign provenance declarations before registry submission.
- **Institutional issuance** — verified organizations can authorize issuer keys and issue independently verifiable records.
- **Registry countersignatures** — HPS verifies submitted signatures and countersigns accepted provenance manifests.
- **Asset integrity** — SHA-256 hashing supports tamper-evident verification.
- **Evidence** — claims can be linked to hashed or sealed supporting material such as drafts, source code, notes, datasets and version history.
- **Independent attestations** — people and institutions can add signed attestations without rewriting the original provenance declaration.
- **Status and accountability** — records can carry active, disputed or revoked status.

## Trusted Research Agent

HPS also includes the **Trusted Research Agent**, a research-integrity and provenance workflow designed to sit inside real research work rather than operate only after publication.

Current prototype capabilities include:

- research sessions and explicit provenance events;
- source capture and evidence notes;
- claim → citation linking;
- DOI verification against Crossref;
- source-origin review signals;
- AI-assistance disclosure;
- human-review checkpoints;
- contradiction candidates and research-integrity warnings;
- document-aware manuscript citation auditing;
- SHA-256 manuscript integrity hashing;
- browser provenance capture;
- Microsoft Word task-pane integration;
- exportable provenance checkpoints.

The privacy principle is:

> **Record the research trail, not the researcher.**

The prototype does not capture keystrokes, hidden browsing history or background document activity. Research content is processed only when the researcher explicitly invokes an audit or provenance action.

See:

- [`docs/TRUSTED-RESEARCH-AGENT.md`](docs/TRUSTED-RESEARCH-AGENT.md)
- [`docs/TRUSTED-RESEARCH-AGENT-V0.4.md`](docs/TRUSTED-RESEARCH-AGENT-V0.4.md)
- [`docs/CATALYST-V0.4.md`](docs/CATALYST-V0.4.md)
- [`docs/CATALYST-DEMO.md`](docs/CATALYST-DEMO.md)
- [`docs/WORD-ADDIN.md`](docs/WORD-ADDIN.md)

## Main application areas

HPS is being developed for:

- researchers and scholarly workflows;
- institutions and institutional issuers;
- creators and digital works;
- AI-assisted knowledge production;
- document and evidence provenance;
- research integrity and review;
- independent verification.

## Core routes

- `/create` — create a provenance record
- `/verify` — verify a record
- `/records` — browse the registry
- `/institutional` — institutional issuance
- `/research-agent` — HPS Trusted Research Agent
- `/docs` — HPS standard documentation
- `/developers` — developer resources

## Microsoft Word integration

The v0.4 research prototype includes a Microsoft Word task-pane add-in.

The manifest is located at:

`word-addin/manifest.xml`

The task pane is served from:

`https://humanprovenancestandard.org/word-addin/taskpane.html`

See [`docs/WORD-ADDIN.md`](docs/WORD-ADDIN.md) for setup and demonstration guidance.

## Development

Requirements:

- Node.js 22+
- Next.js 15
- TypeScript

Install and run:

```bash
npm install
npm run dev
```

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

## Standard principle

No single party should be the sole author of trust.

HPS keeps separate:

1. what a creator or institution claimed;
2. what evidence supports that claim;
3. what signatures attest to it;
4. what HPS actually verified;
5. what later reviewers or institutions attested, disputed or revoked.

This separation is central to the HPS trust model.

## Status

HPS is under active development. The Trusted Research Agent is currently a prototype intended for research-workflow testing, early users and funding/pilot validation.
