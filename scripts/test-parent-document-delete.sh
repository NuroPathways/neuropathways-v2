#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL:-}" ]]; then
  echo "Set PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL to the isolated loopback np_parent_document_delete_test database." >&2
  exit 2
fi
if [[ -n "${PARENT_DOCUMENTS_ROUTE_MODULE:-}" && "${NP_ALLOW_PRE_REPAIR_ROUTE:-}" != "1" ]]; then
  echo "Route overrides are reserved for an explicit isolated pre-repair regression check." >&2
  exit 2
fi

node --input-type=module -e '
const raw = process.env.PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL;
let url;
try {
  url = new URL(raw);
} catch {
  console.error("Invalid isolated test database URL.");
  process.exit(2);
}
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!["127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    databaseName !== "np_parent_document_delete_test") {
  console.error("Refusing database URL: use loopback and database np_parent_document_delete_test.");
  process.exit(2);
}
console.log("Isolated loopback test database verified (connection details hidden).");
'

export DATABASE_URL="$PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL"
export REPLIT_CONNECTORS_ENABLED=false
export NODE_ENV=test
unset AI_INTEGRATIONS_ANTHROPIC_API_KEY AI_INTEGRATIONS_ANTHROPIC_BASE_URL \
  AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY \
  GOOGLE_APPLICATION_CREDENTIALS || true

pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server exec tsx --test \
  src/routes/parent-documents.delete.security.test.ts
