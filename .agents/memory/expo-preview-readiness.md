---
name: Expo preview readiness
description: Distinguish delayed Expo browser hydration from a real blank-screen layout defect.
---

Do not treat a short navigation timeout or an early blank screenshot as proof that the Expo root layout is broken.

**Why:** Cold browser bundling and hydration produced blank early screenshots even though the login interface eventually rendered correctly, with no runtime or layout error.

**How to apply:** During preview diagnosis, wait for DOM-ready navigation and a visible app element with a realistic startup timeout. Development connections can remain open, so network-idle is not a reliable readiness condition. If the interface becomes visible, do not modify root layout solely to address an early screenshot.