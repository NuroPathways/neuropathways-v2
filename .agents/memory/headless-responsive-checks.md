---
name: Headless responsive checks
description: Browser viewport setup for reliable narrow-screen layout checks in this Replit environment.
---

Chromium headless can report a 500px CSS viewport even when launched with a smaller `--window-size`. Set explicit device metrics through the browser debugging protocol before loading the page; assert the measured CSS viewport as part of the check.

**Why:** A false 500px viewport makes a phone-width regression test silently test tablet/desktop layout instead.

**How to apply:** For Chromium-based responsive checks in this workspace, configure width, height, scale factor, and mobile emulation directly, then verify `document.documentElement.clientWidth` before interpreting layout results.
