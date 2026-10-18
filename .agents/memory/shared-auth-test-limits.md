---
name: Shared authentication test limits
description: Browser and API checks share the development authentication quota
---

Authentication requests made by API integration checks and browser checks can consume the same development IP-based rate-limit quota, even for different synthetic accounts.

**Why:** A successful API suite exhausted the quota and blocked both browser fixture sign-ins with HTTP 429; changing account names did not isolate the requests.

**How to apply:** Budget authentication checks together and avoid concurrent authentication-heavy verification. Keep the application's rate-limit protection enabled rather than weakening it for tests.

For parent password sign-in, retain a broad network ceiling but apply the tighter attempt budget to an IP/account pair; registration attempts should not consume login attempts.

**Why:** Families may share a network address, and a single IP-only counter shared by registration and login can block unrelated parents after a few failures.

**How to apply:** Keep both the account-scoped and network-wide limits on parent login, and keep registration throttling separate.

Verify signed-in test access before relying on it for a later visual review. Persistent browser notebooks can reset, and temporary access fixtures are not durable.

**Why:** A later protected-screen review lost both the prior browser sessions and its temporary fixture, despite earlier successful verification.

**How to apply:** Check access early. If both are unavailable, disclose the screenshot gap and obtain permission for fresh isolated verification accounts; never reset existing accounts or weaken authentication to recover test access.