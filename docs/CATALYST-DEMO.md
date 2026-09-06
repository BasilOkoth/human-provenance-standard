# HPS Trusted Research Agent — Catalyst Demo v0.4

## One-line proposition

**HPS Trusted Research Agent is a provenance-aware research workflow that records human and AI contribution, checks whether manuscript claims are traceable to captured evidence, and produces a cryptographically hashable trail that can be signed by a researcher and attested by an institution.**

## Why this is agentic

The prototype does more than log events. It acts on the research state by:

1. resolving captured scholarly DOIs against Crossref;
2. identifying repository/aggregator copies and prompting canonical-source review;
3. linking researcher-entered claims to sources;
4. detecting possible contradiction candidates in evidence notes;
5. ingesting manuscript text and identifying claim-like sentences;
6. resolving recognizable author-year, numeric and DOI citations against the HPS research session;
7. flagging uncited claims, unresolved citations, weak evidence matches and possible claim/evidence conflicts;
8. requiring human review before warnings can be accepted into the provenance trail;
9. recording the manuscript SHA-256 hash and the agent audit in the trail;
10. passing the resulting research trail to HPS signing and institutional verification.

The agent is deliberately bounded. It does not silently browse, record keystrokes, declare truth, or accuse researchers of misconduct.

## Five-minute demonstration

### 1. Start the research session
Create a session titled `Trustworthy AI-assisted research workflows`.

Explain: HPS records only meaningful events explicitly approved by the researcher.

### 2. Capture two scholarly sources
Add a DOI and an evidence note for each source.

Show:
- Crossref DOI resolution;
- canonical record information;
- source-origin warning if an aggregator/repository URL is used.

### 3. Declare AI assistance
Record an event such as:

`ChatGPT was used to restructure the literature-review paragraph. No source claims were generated autonomously.`

Show that HPS now expects a later human-review event.

### 4. Paste manuscript text
Paste a short section containing:
- one properly cited claim;
- one factual claim with no citation;
- one citation whose source is not in the captured research set;
- one strongly worded claim weakly aligned with a source evidence note.

Click **Audit manuscript**.

### 5. Show the agent intervention
The document-aware audit displays:
- supported claims;
- uncited claims;
- unresolved citations;
- weak-support signals;
- possible conflict candidates;
- manuscript SHA-256 hash.

Explain that these are transparent decision-support signals, not claims of truth or misconduct.

### 6. Human review
Select the claims the researcher has reviewed and accepts.
Click **Accept selected claims into HPS trail**.

The accepted document claims become first-class HPS provenance events linked to their resolved source IDs.

### 7. Create a provenance checkpoint
Add a human-review event and checkpoint.

### 8. Export and sign
Export the HPS research trail and continue to the existing HPS signing workflow.

The exported manifest contains:
- all explicit research events;
- DOI/source metadata;
- human/AI contribution disclosures;
- document audit results;
- manuscript hash;
- agent warnings and limitations;
- final session integrity hash.

## Catalyst hypothesis

Researchers and institutions need a way to demonstrate not only *who signed a final research artefact*, but *how evidence, AI assistance, human review and responsibility moved through the workflow that produced it*.

## Prototype success measures for a funded pilot

1. **Traceability:** percentage of manuscript claim-like sentences that can be linked to captured sources.
2. **Citation resolution:** percentage of in-text citations correctly resolved to the research-session source set.
3. **Warning precision:** researcher-rated usefulness/false-positive rate of uncited, unresolved, weak-support and conflict warnings.
4. **Human oversight:** percentage of agent warnings reviewed before final signing.
5. **Provenance completeness:** percentage of research sessions with source, AI-disclosure (where applicable), human-review and checkpoint events.
6. **Usability:** time required to create a verifiable trail and researcher-reported burden.

## Next funded integrations

- Microsoft Word add-in using Office JavaScript APIs;
- Overleaf/LaTeX citation and manuscript integration;
- Zotero/reference-manager integration;
- Crossref/OpenAlex scholarly graph enrichment;
- browser-extension handoff into the web application;
- institutional reviewer dashboard;
- cryptographic signing of document-audit checkpoints with the creator-held HPS key;
- evaluation with researchers and research-integrity staff.
