---
name: Replit production database pause
description: Distinguish a paused managed production database from application errors.
---

When deployed API requests report "The endpoint has been disabled. Enable it using the API and retry." and a production read-only query fails while development succeeds, treat this as a paused production database endpoint rather than a schema or route bug. Replit's documented recovery is to open the Database pane and select **Unpause database**. If that action is unavailable, check whether a manually set `DATABASE_URL` overrides the connection shown in the Database pane. Never ask the user to paste a connection string.

**Why:** A paused production endpoint can make authentication and document operations fail together, while the development database and application build remain healthy.

**How to apply:** Confirm using recent deployment logs and a read-only production probe, direct the workspace owner to unpause the database in the UI, then retest the affected flows before making application changes.
