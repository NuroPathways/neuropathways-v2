---
name: Headless responsive checks
description: Browser viewport setup for reliable narrow-screen layout checks in this Replit environment.
---

Chromium headless can report a 500px CSS viewport even when launched with a smaller `--window-size`. Set explicit device metrics through the browser debugging protocol before loading the page; assert the measured CSS viewport as part of the check.

**Why:** A false 500px viewport makes a phone-width regression test silently test tablet/desktop layout instead.

**How to apply:** For Chromium-based responsive checks in this workspace, configure width, height, scale factor, and mobile emulation directly, then verify `document.documentElement.clientWidth` before interpreting layout results.

For route-specific horizontal overflow, check `document.documentElement.scrollWidth <= clientWidth` and inspect descendants that extend past the viewport. Fixed full-width notification containers and compact selects can overflow only on some screens even when the page cards appear to fit.

**Why:** A narrow-screen sweep found a child selector whose intrinsic option width and a padded fixed notification layer widened History and Settings, while the same viewport appeared correct on Home.

**How to apply:** Set metrics before each route navigation, then check viewport width and document scroll width on every screen that shares the shell, especially routes with forms, overlays, or selects.

## Animated dialog captures

Treat screenshots of an entering dialog as animation samples until its computed opacity has settled. A browser reviewer can capture a partially transparent entrance frame and mistakenly report a persistent readability defect.

**Why:** Help Now was reported as translucent on both parent account modes, but delayed measurements showed a fully opaque panel with no rendering defect. No CSS fix was needed.

**How to apply:** Before editing dialog CSS or expanding an approved redesign scope, wait for the entrance animation, then sample computed panel/wrapper opacity and background at two stable points. Distinguish content showing through the panel from content visible outside its boundary.
