#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${PARENT_DOCUMENT_AI_EVIDENCE_DIR:-$ROOT/.local/verification/parent-document-ai-$STAMP}"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"

TEST_ROOT="$(mktemp -d /tmp/np-parent-document-ai.XXXXXX)"
chmod 700 "$TEST_ROOT"
PGDATA="$TEST_ROOT/pgdata"
SOCKET_DIR="$TEST_ROOT/socket"
mkdir -m 700 "$SOCKET_DIR"
PG_BIN="$(dirname "$(command -v pg_ctl)")"

cleanup() {
  if [[ -d "$PGDATA" ]] && "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >>"$EVIDENCE_DIR/cleanup.log" 2>&1 || true
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT INT TERM

PORT="$(node --input-type=module -e '
import net from "node:net";
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  console.log(server.address().port);
  server.close();
});
')"

{
  printf 'Started UTC: %s\n' "$(date -u +%FT%TZ)"
  printf 'App HEAD: %s\n' "$(git rev-parse HEAD)"
  printf 'Working tree at launch:\n'
  git status --short
  printf 'Runner SHA-256: '
  sha256sum scripts/test-parent-document-ai-simulation.sh | cut -d' ' -f1
  printf 'Test SHA-256: '
  sha256sum artifacts/api-server/src/routes/parent-document-ai.simulation.integration.test.ts | cut -d' ' -f1
  printf 'Evidence directory: %s\n' "$EVIDENCE_DIR"
} >"$EVIDENCE_DIR/run-metadata.txt"
chmod 600 "$EVIDENCE_DIR/run-metadata.txt"

"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$PGDATA" \
  >"$EVIDENCE_DIR/initdb.log" 2>&1
"$PG_BIN/pg_ctl" -D "$PGDATA" -l "$EVIDENCE_DIR/postgres.log" \
  -o "-h 127.0.0.1 -p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start \
  >"$EVIDENCE_DIR/postgres-start.log" 2>&1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U runner np_parent_document_ai_test

export DATABASE_URL="postgres://runner@127.0.0.1:$PORT/np_parent_document_ai_test"
export PARENT_DOCUMENT_AI_TEST_DATABASE_URL="$DATABASE_URL"
export PARENT_DOCUMENT_AI_TEST_ROOT="$TEST_ROOT/work"
export PARENT_DOCUMENT_AI_EVIDENCE_DIR="$EVIDENCE_DIR"
export NP_APP_COMMIT="$(git rev-parse HEAD)"
export FILE_ENCRYPTION_KEY="$(printf 'b%.0s' {1..64})"
export PRIVATE_OBJECT_DIR="np-parent-ai-test/fixture"
export REPLIT_CONNECTORS_ENABLED=false
export NODE_ENV=test
unset AI_INTEGRATIONS_ANTHROPIC_API_KEY AI_INTEGRATIONS_ANTHROPIC_BASE_URL \
  ANTHROPIC_API_KEY GOOGLE_APPLICATION_CREDENTIALS \
  AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY || true

{
  printf 'Schema push started UTC: %s\n' "$(date -u +%FT%TZ)"
  pnpm --filter @workspace/db run push
  printf 'Schema push completed UTC: %s\n' "$(date -u +%FT%TZ)"
} >"$EVIDENCE_DIR/schema-push.log" 2>&1

{
  printf 'Test started UTC: %s\n' "$(date -u +%FT%TZ)"
  pnpm --filter @workspace/api-server exec tsx --test \
    src/routes/parent-document-ai.simulation.integration.test.ts
  printf 'Test completed UTC: %s\n' "$(date -u +%FT%TZ)"
} 2>&1 | tee "$EVIDENCE_DIR/test-run.log"

printf 'Finished UTC: %s\n' "$(date -u +%FT%TZ)" >>"$EVIDENCE_DIR/run-metadata.txt"
printf 'Temporary PostgreSQL and upload files removed by runner EXIT cleanup.\n' \
  >"$EVIDENCE_DIR/cleanup-status.txt"
chmod 600 "$EVIDENCE_DIR/cleanup-status.txt"
printf 'Evidence saved privately at %s\n' "$EVIDENCE_DIR"
