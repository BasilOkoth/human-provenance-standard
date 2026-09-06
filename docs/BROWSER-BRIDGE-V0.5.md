# HPS Browser Bridge v0.5

This update connects the browser extension to the HPS Trusted Research Agent.

## New flow

1. Capture a source.
2. Record AI assistance.
3. Human-review the latest unreviewed AI event.
4. Create a checkpoint.
5. Click **Send trail to HPS**.
6. The extension opens `/research-agent/browser-import`.
7. The browser trail is carried in a URL fragment, decoded locally, and written into the existing HPS research-session local storage.
8. HPS redirects to `/research-agent`, where the imported source, AI, review and checkpoint events become part of the research session.

The JSON remains useful as:
- an export/interchange format;
- a debugging/audit artifact;
- a portable backup;
- a future input to API/institutional workflows.

It is no longer required as a manual step for ordinary browser → HPS use.

## Human review

The extension now:
- finds the most recent unreviewed AI event;
- asks the researcher what was checked or changed;
- marks that AI event reviewed;
- creates a linked `review` provenance event;
- warns at checkpoint time if any AI events remain unreviewed.

## Privacy

The browser trail is still explicit-user-approved only. No keystrokes or hidden browsing history are collected.

The transfer uses a URL fragment (`#trail=...`). URL fragments are handled client-side and are not sent in the normal HTTP request. For very large research trails, a future server/API-backed encrypted transfer mechanism should replace this prototype bridge.

## Branding

The extension now uses a distinctive crimson HPS mark: a red rounded-square badge with a white `H`. The badge is deliberately simple so it remains recognizable at 16×16 browser-toolbar size.
