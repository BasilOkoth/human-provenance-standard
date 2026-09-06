# HPS Trusted Research Agent — Catalyst Prototype v0.2

## Purpose

The HPS Trusted Research Agent extends the Human Provenance Standard from final-artifact signing into the research workflow itself. It records meaningful, user-approved provenance events so a final research output can carry a verifiable history of source use, citation linkage, machine assistance, human review and responsibility.

## Privacy principle

The prototype deliberately does **not** capture keystrokes, hidden browsing history, background page activity or private prompts automatically. Provenance events are created only through explicit user action.

## Event model

- `source` — a research source intentionally captured by the researcher, optionally including DOI, Crossref metadata and an evidence note.
- `claim` — a claim the researcher wants represented in the provenance trail, with explicit links to one or more captured sources.
- `ai` — declared AI assistance, including tool and purpose.
- `review` — a human review checkpoint accepting responsibility for retained content and agent warnings.
- `checkpoint` — a research-state marker before signing, review or handoff.

## Agentic research-integrity layer

### 1. Claim → citation linking
Claims carry the IDs of the sources that support them. The agent flags claims with no linked source and broken links to deleted/missing source events.

### 2. DOI verification
Where a DOI is supplied, the prototype queries Crossref and records:
- verification status;
- canonical DOI;
- source title;
- publication type;
- publisher;
- publication year;
- authors;
- canonical record URL.

Verification is evidence that the DOI resolves to a Crossref metadata record. It is **not** a judgement that the publication is correct or trustworthy.

### 3. Original/canonical-source detection
The agent distinguishes a likely canonical publisher/DOI record from common repository or aggregator copies. It warns when a claim is supported only through repository/aggregator copies and encourages verification against the original/canonical record.

This is an origin heuristic, not a determination that repository copies are invalid.

### 4. Contradictory-source detection
Researchers can add a short `evidenceNote` explaining what each source supports. The prototype compares evidence notes for topical overlap plus opposite directional language (for example, increase/decrease or supports/refutes). Matching pairs are surfaced as **possible contradictions requiring human review**.

HPS does not decide which source is true. This is intentionally a decision-support signal.

### 5. Citation checking
The agent checks whether:
- every claim has at least one linked citation;
- linked source IDs still exist;
- DOI-backed citations were verified where possible;
- claims rely only on repository/aggregator copies;
- sources contain an evidence note explaining what they support.

### 6. Research-integrity warnings
Warnings are categorized and severity-labelled. Current rules cover:
- uncited claims;
- missing/broken citation links;
- DOI verification failures;
- canonical-source/origin concerns;
- possible source contradictions;
- AI assistance without a subsequent human review checkpoint;
- missing provenance checkpoints.

The exported HPS manifest includes the exact rule-based findings and a limitation statement so downstream verifiers can distinguish observed evidence from agent inference.

## Integrity

Exported research trails include a SHA-256 hash of the canonical serialized research session. The export is intended to become evidence for the existing HPS creator-signing and registry-countersigning flow rather than replacing HPS signatures.

## Browser extension

The Manifest V3 browser extension provides the smallest embedded workflow proof:
- save the current page as a research source;
- declare AI assistance;
- create checkpoints;
- export the provenance trail as JSON.

No host permissions are requested in v0.1. The extension therefore cannot silently read arbitrary pages or browsing history.

## Catalyst demonstration

A demonstration can show:
1. Start a research session in `/research-agent`.
2. Capture two papers and add their DOIs.
3. Verify DOI metadata against Crossref.
4. Record what each source supports in an evidence note.
5. Add a claim and link it to the sources.
6. Show an uncited-claim warning by temporarily creating a second claim with no source.
7. Add two evidence notes with opposing findings and show the contradiction-review flag.
8. Declare AI restructuring/summarisation assistance.
9. Observe the missing-human-review warning.
10. Add human review and a provenance checkpoint.
11. Export the hashed HPS research trail, including agent findings.
12. Continue into the existing HPS `/create` flow for creator signing and registry issuance.

## Next sophistication

- Crossref/OpenAlex metadata reconciliation.
- Full-text claim grounding where rights and access permit it.
- Retraction and correction checks through Crossmark/Retraction Watch-compatible sources where available.
- Citation-context extraction from Word/Overleaf documents.
- Zotero/Mendeley library integration.
- Word add-in for section-level provenance checkpoints.
- Overleaf integration for research-writing checkpoints.
- Institution-issued researcher identity and supervisor attestations.
- Semantic contradiction analysis with transparent evidence excerpts and confidence bounds.

## v0.4 — Document-aware citation audit

The Catalyst prototype now includes document-aware research-integrity checks. A researcher can submit manuscript text to the agent. The agent:

- hashes the manuscript text with SHA-256;
- detects claim-like sentences using transparent deterministic rules;
- extracts author-year, numeric and DOI citation markers;
- resolves those markers against sources already captured in the HPS session;
- flags uncited claims and unresolved citations;
- estimates lexical alignment between a claim and the source evidence note as a triage signal;
- flags possible claim/evidence polarity conflicts for human review;
- allows reviewed claims to be accepted into the provenance timeline with source links;
- preserves the full audit object in the research-session export.

This is intentionally not a truth engine. The agent exposes its method and limitations, and the human researcher remains responsible for reviewing warnings before HPS signing.
