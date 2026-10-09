---
name: Security advisory verification
description: Why dependency version updates and clean audit results need attack regressions when fixes are unavailable.
---

Do not treat a newer registry release or a clean dependency audit as proof that a reported vulnerability is fixed. Verify the reported attack behavior when an advisory has no declared patched release.

**Why:** A newer http-cache-semantics release still permitted security-zeroed cache entries to become stale hits. Only an attack regression exposed that the version update was insufficient.

**How to apply:** Check advisory ranges and published fixes, reproduce the vulnerable behavior, and retain positive compatibility tests alongside the attack test. If no safe upstream release exists, use explicitly identified local security forks with retained licenses and upstream provenance, actual source fixes, and tests against the consumer-resolved package. Replace forks with upstream fixes once available; never merely relabel vulnerable code or suppress the advisory.
