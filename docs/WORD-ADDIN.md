# HPS Trusted Research Agent — Microsoft Word integration (v0.4)

## Why this matters for Catalyst

The Catalyst call asks applicants to name the tool the agent must live inside and favors agents embedded in real research work. v0.4 provides a concrete Microsoft Word task-pane integration rather than describing Word as a future possibility.

## What the Word proof of concept does

Inside Microsoft Word, the researcher can explicitly:

1. Audit the full document or current selection.
2. Read the manuscript through the Word JavaScript API.
3. Compute a SHA-256 hash of the captured text.
4. Run a lightweight claim/citation pre-check inside the task pane.
5. Record an AI-assistance disclosure.
6. Transfer the exact manuscript into `/research-agent` for the deeper HPS document-aware audit.
7. Continue with source resolution, DOI checks, claim-to-citation linking, warnings, human review, checkpoints and HPS signing.

The Word add-in does **not** record keystrokes, hidden browsing or background document activity.

## Deployment

Copy the package files into the existing HPS repository and deploy the Next.js application. The task pane is served from:

`https://humanprovenancestandard.org/word-addin/taskpane.html`

The included `word-addin/manifest.xml` points to that URL. Sideload the manifest into Word for testing. If the deployed HPS domain changes, update `SourceLocation` before sideloading.

## Catalyst demo

1. Open a research manuscript in Word.
2. Open **HPS Trusted Research Agent** from the Word add-ins/task-pane interface.
3. Click **Audit document**.
4. Show claim-like sentence count, citation markers, uncited-claim warnings and the manuscript SHA-256 hash.
5. Record an example AI-assistance disclosure.
6. Click **Open full HPS audit**.
7. HPS opens the research-agent workspace with the manuscript already imported.
8. Run the document-aware citation audit.
9. Resolve sources/DOIs and review agent warnings.
10. Accept reviewed claims, add a human-review event and create a provenance checkpoint.
11. Export/sign the HPS trail.

## Current boundary

The Word-side pre-check is intentionally lightweight. Source verification, DOI resolution, contradiction candidates and richer claim-to-evidence checks remain in the HPS agent. This keeps the embedded integration fast while preserving a single auditable provenance engine.
