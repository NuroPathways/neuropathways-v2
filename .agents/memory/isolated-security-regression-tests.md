---
name: Isolated security regression tests
description: Safe setup principles for synthetic security fixtures in this workspace.
---

Load test-kit fixtures only into a disposable localhost database and a separate test app process with its own uploads directory. Set the test `DATABASE_URL` explicitly, remove production/deployment indicators from the test process, and never rely on the workspace's inherited database configuration. Inspect every seeder output: some kits copy a seed module into `$GOLDEN_APP_DIR` and fixture files into `$GOLDEN_UPLOADS_DIR`. Point both variables at the private test app, not the workspace.

Third-party security kits are often calibrated to one code snapshot. Independently record the actual commit and runtime configuration; do not trust a generated manifest if it hard-codes the original target. For access-control checks, treat 401, 403, and 404 as denied when the property is that data is not disclosed. Run missing-key and other startup-configuration checks in their own explicitly configured server mode.

**Why:** Fixture seeders can delete and reinsert rows by fixture ID, and may also copy source files or binaries into the app tree. A test database URL alone does not isolate those filesystem writes. A kit run against newer code can also produce misleading failures when its expected commit, environment, or accepted denial statuses are stale. In this Nix environment, a temporary PostgreSQL server may need its Unix socket directed to a writable temporary directory.

**How to apply:** Generate and validate synthetic data under `/tmp`, start PostgreSQL bound to loopback with an explicitly named test database, point the app, seed module, uploads, and object storage at private test locations, then verify cleanup. If a Node test changes to a temporary working directory and TSX resolution fails in its worker, run it with an absolute `tsx/dist/loader.mjs` path in `NODE_OPTIONS` rather than weakening the test.
