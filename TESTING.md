# NeuroPathways — Testing Guide

## Quick Start

Two test suites exist: a bash API test suite and a browser-based frontend test runner.

### 1. API Test Suite (bash + curl)

```bash
API_BASE_URL="https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev" ./test-suite.sh
```

150+ assertions covering health, security headers, CORS, auth guards, CRUD on all 14 entity types, client sessions, mobile auth, access code changes, tenant isolation, and parent document upload (client-upload + client-upload-document). Rate limiter is 100 req/15 min — wait 15 minutes between runs.

### 2. Browser-Based Frontend Test Runner

Open this URL in a browser:

```
https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev/test-runner.html
```

This is a self-contained HTML page served by the Vite dev server. It runs 70 tests directly in the browser using `fetch()` against the same API origin — no CORS issues, no setup needed.

#### What the frontend test runner covers

| Category | Tests | What it validates |
|----------|-------|-------------------|
| Auth guards | 15 routes | Every protected endpoint rejects unauthenticated requests with 401 |
| Public routes | 4 endpoints | Login, verify-credentials, change-access-code, mobile auth accept unauthenticated requests |
| Registration | 3 tests | Rejects empty body, rejects short password, creates account |
| Login | 3 tests | Rejects wrong password, succeeds with correct credentials, returns session cookie |
| User profile | 2 tests | GET /users/me returns user data, PATCH updates profile |
| Family CRUD | 3 tests | Create client account, list families, get family by ID |
| Children CRUD | 3 tests | List children, get child by ID, update child |
| Behavior plans | 3 tests | Create, read, update behavior plans |
| Documents | 2 tests | Create and read documents |
| Behavior logs | 2 tests | Create and read behavior logs |
| Win logs | 1 test | Create win log |
| Client sessions | 3 tests | Login with access code, get portal data, verify credentials |
| Client portal | 3 tests | Portal data includes child info, plans, behavior logs |
| Parent upload | 12 tests | Auth guards, validation, file upload, document record, portal visibility, MIME filtering |
| Security | 3 tests | Helmet headers present, CORS rejects bad origins, X-Powered-By absent |

#### How to read the results

- Green checkmarks = passed
- Red X marks = failed (click to expand error details)
- Yellow skip marks = rate limited (429) — wait 15 min and rerun
- Summary bar at the top shows pass/fail/skip counts
- Tests run sequentially to avoid rate limiting — takes about 30 seconds

#### If tests fail due to rate limiting

The API enforces 100 requests per 15-minute window. If you see many 429 responses:

1. Wait 15 minutes for the window to reset
2. Reload the page
3. Click "Run All Tests" again

## URLs

| Environment | URL |
|-------------|-----|
| Replit dev server | `https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev/` |
| Published app | `https://nuropath-ai--NeuroPathways.replit.app/` |
| Test runner | `https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev/test-runner.html` |

The test runner only works against the dev server URL (same-origin requests). The published URL requires Ramez to republish after pulling the latest code.

## Running with Claude Code cowork

To have Claude Code run the frontend tests interactively:

1. Start Claude Code in the `neuropathways-v2` directory
2. Ask it to open the test runner URL in a browser and run all tests
3. Claude Code can read the test results page and report pass/fail status

Example prompt:
```
Open https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev/test-runner.html in a browser and run all the frontend tests. Report the results.
```

For the API test suite, Claude Code can run it directly:
```
Run the API test suite against the Replit dev server and report results.
```

## Prerequisites for Replit

Before tests will pass on Replit, ensure:

1. **Latest code pulled** — In Replit AI chat, run:
   ```
   git fetch origin main && git reset --hard origin/main
   ```

2. **CORS_ORIGIN secret set** — Must include the dev server origin. In Replit Secrets:
   ```
   CORS_ORIGIN=https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev
   ```

3. **Server restart** — After pulling code or changing secrets, restart the Replit dev server

4. **FILE_ENCRYPTION_KEY** (optional) — 64 hex chars for upload encryption at rest. App works without it (files stored unencrypted).

## Test file locations

| File | Purpose |
|------|---------|
| `test-suite.sh` | Bash API test suite (120+ assertions) |
| `artifacts/neuropath/public/test-runner.html` | Browser frontend test runner (50+ tests) |
| `test-scenarios.md` | Full scenario list including manual UI tests |

## Isolated parent-document deletion regression

This route-level integration test uses the real parent-session authorization, document routes, PostgreSQL rows, and audit writer. It does not use the Replit app database or uploads. Storage is an in-memory fake explicitly limited to the test process; this is not a cloud-storage integration test.

Create a temporary PostgreSQL cluster and bind it only to loopback:

```bash
PG_BIN="$(dirname "$(command -v pg_ctl)")"
TEST_ROOT="$(mktemp -d /tmp/np-parent-doc-delete.XXXXXX)"
mkdir -m 700 "$TEST_ROOT/socket"
"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$TEST_ROOT/pgdata"
"$PG_BIN/pg_ctl" -D "$TEST_ROOT/pgdata" -l "$TEST_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -p 55490 -k $TEST_ROOT/socket -c listen_addresses=127.0.0.1" start
"$PG_BIN/createdb" -h 127.0.0.1 -p 55490 -U runner np_parent_document_delete_test
export PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL='postgres://runner@127.0.0.1:55490/np_parent_document_delete_test'
pnpm --filter @workspace/api-server run test:parent-document-delete
```

The runner rejects non-loopback hosts or any database name other than `np_parent_document_delete_test`, applies the schema only to that database, inserts fictional family fixtures, runs the route test, and removes only its fixture rows. It disables connectors and never calls live AI or cloud storage. A successful run ends with `tests 1`, `pass 1`, `fail 0`.

Afterward, remove only this disposable database and cluster:

```bash
"$PG_BIN/dropdb" -h 127.0.0.1 -p 55490 -U runner np_parent_document_delete_test
"$PG_BIN/pg_ctl" -D "$TEST_ROOT/pgdata" -m fast stop
rm -rf -- "$TEST_ROOT"
unset PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL
```

Run these cleanup commands only for the `TEST_ROOT` created above. Never point the runner at an app, development, or production database. The test's storage fake is in memory and disappears when the test process exits.
