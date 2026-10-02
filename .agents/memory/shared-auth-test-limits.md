---
name: Shared authentication test limits
description: Browser and API checks share the development authentication quota
---

Authentication requests made by API integration checks and browser checks can consume the same development IP-based rate-limit quota, even for different synthetic accounts.

**Why:** A successful API suite exhausted the quota and blocked both browser fixture sign-ins with HTTP 429; changing account names did not isolate the requests.

**How to apply:** Budget authentication checks together and avoid concurrent authentication-heavy verification. Keep the application's rate-limit protection enabled rather than weakening it for tests.