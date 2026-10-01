---
name: Guidance consent provenance
description: Why source priority and clinician review must not bypass consent for mixed-source generated guidance.
---

Source priority and consent provenance are separate. A stronger clinical source does not remove private contributing sources from generated guidance.

**Why:** Guidance generated from a private parent plan and a clinical plan could appear consent-safe after its parent references were removed to assign clinical priority. A clinician-facing review response also leaked private guidance when it reused the owner's full dashboard projection.

**How to apply:** Preserve every contributing generation-context source, including sources omitted from model citations. Require consent for all contributing private documents before clinician display or review. Use the clinician-filtered projection for both preview and action responses, and test mixed-source visibility before sharing, after sharing, and after revocation.

Do not include previous document-derived support cards in a new scan's generation context unless their transitive provenance is also tracked. Prefer independent document generation and deterministic post-generation reconciliation.

**Why:** Recording fetched-file sources alone still allowed private prior guidance to influence a subsequently shared scan through the prompt's existing-card context.

**How to apply:** Test the production prompt builder, not just seeded complete-provenance cards. Verify prior private card content and identifiers cannot enter an independently generated scan.