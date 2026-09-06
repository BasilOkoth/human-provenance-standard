# HPS Trusted Research Agent — Catalyst Prototype v0.4

This package extends the Human Provenance Standard with a Catalyst-focused research agent and a Microsoft Word task-pane proof of concept.

## v0.4 capabilities

- Research sessions and explicit provenance events
- Source capture and evidence notes
- Claim → citation linking
- DOI verification against Crossref
- Source-origin review signals
- AI-assistance disclosure and human-review checkpoints
- Contradiction candidates and research-integrity warnings
- Document-aware manuscript citation audit
- Manuscript SHA-256 integrity hashing
- **Microsoft Word task-pane integration**
- Word document/selection import into HPS
- Embedded Word pre-check for claim-like sentences and citation markers
- HPS provenance checkpoints and export

## Files

- `src/app/research-agent/page.tsx` — Catalyst research-agent workspace
- `src/components/DocumentCitationInspector.tsx` — manuscript-aware citation audit UI
- `src/lib/documentCitationAudit.ts` — document audit engine
- `public/word-addin/taskpane.html` — Word task pane
- `public/word-addin/taskpane.js` — Office.js document bridge and pre-check
- `public/word-addin/taskpane.css` — task-pane styling
- `word-addin/manifest.xml` — Word sideload manifest
- `browser-extension/` — explicit browser provenance capture prototype
- `docs/WORD-ADDIN.md` — Word integration setup/demo
- `docs/CATALYST-V0.4.md` — Catalyst positioning and evaluation logic
- `docs/CATALYST-DEMO.md` — document-aware demo flow

## Privacy principle

**Record the research trail, not the researcher.**

The prototype does not capture keystrokes, hidden browsing history or background document activity. Word content is read only when the researcher explicitly clicks an audit action.

## Deployment note

The included Word manifest uses:

`https://humanprovenancestandard.org/word-addin/taskpane.html`

Deploy the package into the HPS Next.js repository, confirm that URL is served over HTTPS, then sideload `word-addin/manifest.xml` into Microsoft Word.
