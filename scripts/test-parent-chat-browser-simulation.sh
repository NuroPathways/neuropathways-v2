#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EVIDENCE_DIR="${PARENT_CHAT_BROWSER_EVIDENCE_DIR:-$ROOT/.local/verification/parent-chat-browser-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
TEST_ROOT="$(mktemp -d /tmp/np-parent-chat-browser.XXXXXX)"
chmod 700 "$TEST_ROOT"
PGDATA="$TEST_ROOT/pgdata"
SOCKET_DIR="$TEST_ROOT/socket"
mkdir -m 700 "$SOCKET_DIR"
PG_BIN="$(dirname "$(command -v pg_ctl)")"
APP_SOURCE_FILES=(
  "artifacts/api-server/src/lib/documentAi.ts"
  "artifacts/api-server/src/lib/parentDocuments.ts"
  "artifacts/api-server/src/lib/documentClassificationRecovery.ts"
  "artifacts/api-server/src/routes/entities.ts"
  "artifacts/api-server/src/routes/parent-documents.ts"
  "artifacts/api-server/src/routes/parent-document-ai.simulation.integration.test.ts"
)
sha256sum "${APP_SOURCE_FILES[@]}" >"$EVIDENCE_DIR/app-source-manifest.sha256"
APP_SOURCE_MANIFEST_SHA256="$(sha256sum "$EVIDENCE_DIR/app-source-manifest.sha256" | cut -d' ' -f1)"
APP_WORKTREE_DIFF_SHA256="$(git diff --binary HEAD -- "${APP_SOURCE_FILES[@]}" | sha256sum | cut -d' ' -f1)"
PORT="$(node --input-type=module -e '
import net from "node:net";
const server = net.createServer();
server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });
')"

cleanup() {
  if [[ -d "$PGDATA" ]] && "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >>"$EVIDENCE_DIR/cleanup.log" 2>&1 || true
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT INT TERM

{
  printf 'Started UTC: %s\n' "$(date -u +%FT%TZ)"
  printf 'App commit: %s\n' "$(git rev-parse HEAD)"
  printf 'Working tree:\n'
  git status --short
  printf 'Application source manifest SHA-256: %s\n' "$APP_SOURCE_MANIFEST_SHA256"
  printf 'Application tracked diff SHA-256: %s\n' "$APP_WORKTREE_DIFF_SHA256"
  printf 'Browser harness SHA-256: '
  sha256sum scripts/parent-chat-browser-simulation.mts | cut -d' ' -f1
  printf 'Test runner SHA-256: '
  sha256sum scripts/test-parent-chat-browser-simulation.sh | cut -d' ' -f1
  printf 'Evidence directory: %s\n' "$EVIDENCE_DIR"
  printf 'Test database: np_parent_chat_browser_test (loopback only)\n'
  printf 'Storage and AI: fake local services only\n'
} >"$EVIDENCE_DIR/run-metadata.txt"
chmod 600 "$EVIDENCE_DIR/run-metadata.txt"

"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$PGDATA" \
  >"$EVIDENCE_DIR/initdb.log" 2>&1
"$PG_BIN/pg_ctl" -D "$PGDATA" -l "$EVIDENCE_DIR/postgres.log" \
  -o "-h 127.0.0.1 -p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start \
  >"$EVIDENCE_DIR/postgres-start.log" 2>&1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U runner np_parent_chat_browser_test

export DATABASE_URL="postgres://runner@127.0.0.1:$PORT/np_parent_chat_browser_test"
export NODE_ENV=test
export BASE_PATH=/
export PORT=5178
export FILE_ENCRYPTION_KEY="$(printf 'c%.0s' {1..64})"
export PRIVATE_OBJECT_DIR="np-parent-chat-browser/fixture"
export REPLIT_CONNECTORS_ENABLED=false
export PARENT_CHAT_BROWSER_TEST_ROOT="$TEST_ROOT"
export PARENT_CHAT_BROWSER_EVIDENCE_DIR="$EVIDENCE_DIR"
export NP_APP_COMMIT="$(git rev-parse HEAD)"
export NP_APP_SOURCE_MANIFEST_SHA256="$APP_SOURCE_MANIFEST_SHA256"
export NP_APP_WORKTREE_DIFF_SHA256="$APP_WORKTREE_DIFF_SHA256"
export NP_TEST_EVIDENCE_DIR="$EVIDENCE_DIR"
export NODE_OPTIONS="--require=$ROOT/scripts/isolated-loopback-network-guard.cjs"
unset AI_INTEGRATIONS_ANTHROPIC_API_KEY AI_INTEGRATIONS_ANTHROPIC_BASE_URL \
  ANTHROPIC_API_KEY GOOGLE_APPLICATION_CREDENTIALS \
  AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY || true

{
  printf 'Schema push started UTC: %s\n' "$(date -u +%FT%TZ)"
  pnpm --filter @workspace/db run push
  printf 'Schema push completed UTC: %s\n' "$(date -u +%FT%TZ)"
} >"$EVIDENCE_DIR/schema-push.log" 2>&1

{
  printf 'Browser test started UTC: %s\n' "$(date -u +%FT%TZ)"
  pnpm --filter @workspace/api-server exec tsx "$ROOT/scripts/parent-chat-browser-simulation.mts"
  printf 'Browser test completed UTC: %s\n' "$(date -u +%FT%TZ)"
} 2>&1 | tee "$EVIDENCE_DIR/test-run.log"

printf 'Finished UTC: %s\n' "$(date -u +%FT%TZ)" >>"$EVIDENCE_DIR/run-metadata.txt"
printf 'Disposable PostgreSQL and browser profile removed by runner cleanup; evidence retained.\n' \
  >"$EVIDENCE_DIR/cleanup-status.txt"
chmod 600 "$EVIDENCE_DIR/cleanup-status.txt"
printf 'Evidence saved privately at %s\n' "$EVIDENCE_DIR"
