---
name: Support availability
description: Keep urgent-support access independent of optional analytics and account-specific tracking capabilities.
---

Urgent-support flows must remain usable when optional engagement tracking is unavailable or rejected. A failed background tracking request must not navigate away, reset the page, or hide guidance.

**Why:** A caregiver could load their support cards successfully, but a denied tracking request on behavior selection redirected the entire page and interrupted the guidance.

**How to apply:** Treat optional analytics failures separately from authentication failures on essential data requests. Respect tracking opt-outs throughout nested support components, without weakening server authorization. Regression checks should select an actual behavior, not stop at the behavior-choice screen.
