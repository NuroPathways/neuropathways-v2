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

Separately displayed plan goals require their own consent provenance when they update independently of reviewed support steps. Auxiliary text must follow the same provenance boundaries.

**Why:** A private plan goal can accompany public reviewed guidance. Clearing the explicit plan-goal field is insufficient if its text also enters merged related-goal lists or conflict messages.

**How to apply:** Track all contributing goal sources and clear goal text and references unless all sources are visible to the clinician. Do not merge private losing-card auxiliary text into public winning guidance without its provenance.

Do not equate a retained derived-profile database row with an access leak. On source unshare or clinic-link revocation, remove that source from active clinician projections and AI context, but do not physically purge retained clinical history unless the retention policy explicitly requires it.

**Why:** The corrected November kit expects a derived profile row to be deleted after revocation, while the approved permissions guidance requires revoked information to disappear from active views and AI without indiscriminately deleting legitimately retained clinical records.

**How to apply:** Verify former-clinician and later-clinician API projections and model-request context after revocation. If those deny the source but a derived row remains, report the row-retention rule as `NEEDS_DECISION` until an explicit purge/deactivation policy is approved.