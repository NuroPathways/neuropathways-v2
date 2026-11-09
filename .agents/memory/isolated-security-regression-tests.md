---
name: Isolated security regression tests
description: Safe setup principles for synthetic security fixtures in this workspace.
---

Load test-kit fixtures only into a disposable localhost database and a separate test app process with its own uploads directory. Set the test `DATABASE_URL` explicitly, remove production/deployment indicators from the test process, and never rely on the workspace's inherited database configuration. Stop the temporary database and API after the run.

**Why:** Fixture seeders can delete and reinsert rows by fixture ID. The workspace has a configured application database, so implicit environment inheritance can put real data at risk. In this Nix environment, a temporary PostgreSQL server may also need its Unix socket directed to a writable temporary directory.

**How to apply:** Generate and validate synthetic data under `/tmp`, start PostgreSQL bound to loopback with an explicitly named test database, point only the isolated app process at it, and verify the service is stopped and temporary data removed at the end.
