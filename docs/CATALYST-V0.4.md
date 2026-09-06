# Catalyst v0.4 positioning

## Research decision

**Is this research claim sufficiently supported, traceable and human-reviewed to remain in the manuscript?**

Researchers, supervisors, co-authors and reviewers make this decision repeatedly during drafting and revision.

## Lifecycle position

Writing · Evidence synthesis · Research integrity

## Embedded system

**Microsoft Word** is the first concrete host integration. The HPS task pane reads only the document/selection the researcher explicitly asks it to audit, computes an integrity hash, surfaces review signals, records declared AI assistance, and transfers the manuscript into the full provenance workflow.

## Why it is agentic

The workflow maintains state across multiple steps:

source capture → DOI verification → claim extraction → citation resolution → evidence support checks → AI-disclosure checks → warning/escalation → human review → document hash/checkpoint → cryptographic provenance record.

A single prompt cannot establish this persistent, inspectable history.

## Failure/escalation tests

The agent should flag or escalate rather than decide when:

- a substantive claim has no citation;
- a citation cannot be resolved to a captured source;
- a DOI cannot be verified;
- a claim is supported only by secondary/aggregator copies;
- evidence notes appear directionally inconsistent;
- AI-assisted material has no subsequent human review;
- wording overstates what the available evidence supports.

## Prototype outcome metrics

Primary: **percentage of substantive manuscript claims with traceable evidence and documented human review before submission.**

Secondary:

- unsupported claims detected/resolved;
- unresolved citations detected/resolved;
- reviewer/supervisor minutes saved;
- proportion of AI-assistance events followed by human review;
- time from first audit to provenance-ready manuscript;
- warning acceptance/override rate and reasons.

## Differentiator

HPS is not only a writing checker. It preserves the relationship between **evidence, machine action, agent inference, human decision and cryptographic responsibility** as a verifiable provenance trail.
