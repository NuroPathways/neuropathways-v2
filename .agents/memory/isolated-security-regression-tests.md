---
name: Isolated security regression tests
description: Safe setup principles for synthetic security fixtures in this workspace.
---

Load test-kit fixtures only into a disposable localhost database and a separate test app process with its own uploads directory. Set the test `DATABASE_URL` explicitly, remove production/deployment indicators from the test process, and never rely on the workspace's inherited database configuration. Stop the temporary database and API after the run.

Third-party security kits are often calibrated to one code snapshot. Independently record the actual commit and runtime configuration; do not trust a generated manifest if it hard-codes the original target. For access-control checks, treat 401, 403, and 404 as denied when the property is that data is not disclosed. Run missing-key and other startup-configuration checks in their own explicitly configured server mode.

**Why:** Fixture seeders can delete and reinsert rows by fixture ID. The workspace has a configured application database, so implicit environment inheritance can put real data at risk. A kit run against newer code can also produce misleading failures when its expected commit, environment, or accepted denial statuses are stale. In this Nix environment, a temporary PostgreSQL server may need its Unix socket directed to a writable temporary directory.

**How to apply:** Generate and validate synthetic data under `/tmp`, start PostgreSQL bound to loopback with an explicitly named test database, point only the isolated app process at it, verify the service is stopped and temporary data removed, and review every failing assertion against the current route behavior and the actual test environment.
