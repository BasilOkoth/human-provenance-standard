Add this disclosure to the HPS Privacy Policy before enabling public_text mode
for general users:

### Public textual integrity witnesses

Where a record owner or authorized issuer explicitly enables **Public Textual
Integrity**, HPS stores the normalized text recovered from the registered
original document as part of a signed verification witness. This makes that
recovered text available to a verifier's browser so HPS can compare a later
candidate locally and identify textual insertions, deletions and replacements
without requiring the verifier to possess the original file.

This mode is intended for documents whose textual contents may appropriately be
used for public verification. It should not be enabled for confidential
documents. The original source file bytes are not stored by this witness
feature. Candidate file bytes and complete candidate text remain in the
verifier's browser during the public-text comparison.
