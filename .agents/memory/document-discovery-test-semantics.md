---
name: Document discovery test semantics
description: Avoid false failures when model-based discovery legitimately matches a target to an existing starter category.
---

Use unambiguous, distinct targets when testing discovery of a new custom behavior. Context-specific names can legitimately match an existing starter category.

**Why:** A bedtime-stalling fixture can correctly match Task Refusal rather than create a custom card. Expecting a new custom identity then reports valid matching as a failure.

**How to apply:** Test known-category matching and genuinely custom discovery separately. For custom discovery, choose a clearly distinct target with an explicit source goal; verify exact goal wording, provenance, stable deduplication, and unchanged parent selections.