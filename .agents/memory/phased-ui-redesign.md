---
name: Redesign approval gates
description: User-required scope boundaries and explicit approvals for the phased mobile and desktop redesign.
---

Perform the NeuroPathways redesign one phase at a time. The initial audit phase permits inventory, analysis, screenshots, a redesign plan and a recovery checkpoint, not UI changes. Completing a phase, passing tests, silence or unused time never authorizes the next phase.

**Why:** The user explicitly requires review and approval between every phase, rather than an autonomous whole-app redesign.

**How to apply:** Follow the uploaded phased redesign brief. Present the completed phase using its required headings: What Changed, Files Modified, Before and After, What Was Preserved, Testing, Remaining Issues and Approval Required. Supply actual running-app screenshots, distinguish inspected code from tested behavior, and stop for explicit approval. Revisions remain within the current phase. Obtain approval before shared-component side effects or unrelated blocking bug fixes.

The redesign is visual and organizational only: preserve features, route names, shortcut destinations, the current palette and logo, desktop sidebar, emergency access, stored data, account relationships, permissions, and all supported account modes. Do not reset the working tree to GitHub or silently change clinical content.

Phase 1 establishes isolated foundation/component previews before application-wide adoption. Approval to build those examples does not authorize changing Home or migrating global application styling.

**Why:** The brief explicitly requires reviewing the foundation examples first, with Home and subsequent screens authorized in separate phases. A global theme or CSS-toolchain migration could change those screens prematurely.

**How to apply:** Keep foundation adoption scoped to the individually approved screen phase. Do not treat a shared stylesheet migration as incidental setup; review its effects on unapproved roles and pages before applying it.

Help Now may collapse optional explanations and prevention/background material, but emergency instructions, immediate safety guidance, escalation warnings, things to avoid and clinician-contact thresholds must remain outside collapsed sections.

**Why:** The user's redesign brief prioritizes caregivers who may have limited time or attention during a stressful event; reducing visual density must not make critical guidance harder to reach.

**How to apply:** Keep source text intact, emphasize the current saved action and retain every step/control. If a note's urgency is unclear, keep it visible rather than assuming that long text is nonurgent. Presentation changes must not change eligibility, branching or logging contracts.

Foundation adoption must also isolate legacy structural styles, not only colors and typography.

**Why:** Adding a disclosure can shift positional grid rows so an old reserved message row creates a large blank disclosure. Legacy important height rules can also override a correctly scoped new stylesheet.

**How to apply:** Inspect inherited grid tracks, sticky positioning and height constraints when changing a component's child structure. Remove obsolete structural classes within the approved component rather than changing global rules used by other screens; verify closed disclosures and the composer in an actual browser.

Document technical failures may use concise summaries and expandable diagnostics, but successful readings with safety notes must keep the complete note visible.

**Why:** A safety note can contain clinical constraints or urgent warnings. Its length does not make it safe to collapse along with secondary metadata.

**How to apply:** Use trusted processing/safety status rather than keyword guesses. Keep Needs Review safety notes outside disclosure while preserving full technical failure text in accessible details.
