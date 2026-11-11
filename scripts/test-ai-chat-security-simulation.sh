#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${AI_CHAT_TEST_EVIDENCE_DIR:-$ROOT/.local/verification/neuro-ai-chat-security-$STAMP}"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"

TEST_ROOT="$(mktemp -d /tmp/np-ai-chat-security.XXXXXX)"
chmod 700 "$TEST_ROOT"
PGDATA="$TEST_ROOT/pgdata"
SOCKET_DIR="$TEST_ROOT/socket"
mkdir -m 700 "$SOCKET_DIR"
PG_BIN="$(dirname "$(command -v pg_ctl)")"
STARTED_AT="$(date -u +%FT%TZ)"

cleanup() {
  local cleanup_status="cleaned"
  if [[ -d "$PGDATA" ]] && "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    if ! "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >>"$EVIDENCE_DIR/cleanup.log" 2>&1; then
      cleanup_status="postgres-stop-failed"
    fi
  fi
  rm -rf -- "$TEST_ROOT"
  printf 'Status: %s\nTest root removed: %s\nFinished UTC: %s\n' \
    "$cleanup_status" "$TEST_ROOT" "$(date -u +%FT%TZ)" \
    >"$EVIDENCE_DIR/cleanup-status.txt"
  chmod 600 "$EVIDENCE_DIR/cleanup-status.txt"
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

APP_SOURCE_FILES=(
  "artifacts/api-server/src/routes/ai.ts"
  "artifacts/api-server/src/routes/parent-documents.ts"
  "artifacts/api-server/src/lib/parentDocuments.ts"
  "artifacts/api-server/src/lib/parentChatPolicy.ts"
  "artifacts/api-server/src/lib/parentChatPolicy.test.ts"
  "artifacts/api-server/src/lib/aiChatPolicy.ts"
  "artifacts/api-server/src/lib/aiChatPolicy.test.ts"
  "artifacts/api-server/src/lib/aiOperationalControls.test.ts"
  "artifacts/api-server/src/routes/ai-chat-security.simulation.integration.test.ts"
  "artifacts/api-server/tests/parent-link.integration.ts"
  "artifacts/neuropath/src/api/entities.js"
  "artifacts/neuropath/src/api/entities.test.js"
  "artifacts/neuropath/src/pages/AIChat.jsx"
  "artifacts/neuropath-mobile/lib/api.ts"
  "artifacts/neuropath-mobile/app/(tabs)/ai.tsx"
  "artifacts/neuropath-mobile/app/help.tsx"
  "artifacts/neuropath-mobile/app/(parent)/chat.tsx"
  "lib/api-spec/openapi.yaml"
  "lib/api-zod/src/generated/api.ts"
  "lib/api-zod/src/generated/types/index.ts"
  "lib/api-zod/src/generated/types/aiChatInput.ts"
  "lib/api-zod/src/generated/types/aiChatInputMode.ts"
  "lib/api-zod/src/generated/types/parentChatInput.ts"
  "lib/api-zod/src/generated/types/parentChatInputMode.ts"
  "lib/api-zod/src/generated/types/parentChatResult.ts"
  "lib/api-zod/src/generated/types/parentChatResultOutcome.ts"
  "lib/api-client-react/src/generated/api.ts"
  "lib/api-client-react/src/generated/api.schemas.ts"
)

{
  printf 'Started UTC: %s\n' "$STARTED_AT"
  printf 'Base commit: %s\n' "$(git rev-parse HEAD)"
  printf 'Branch and status:\n'
  git status --short --branch
  printf 'Evidence directory: %s\n' "$EVIDENCE_DIR"
} >"$EVIDENCE_DIR/run-metadata.txt"
chmod 600 "$EVIDENCE_DIR/run-metadata.txt"
sha256sum "${APP_SOURCE_FILES[@]}" scripts/test-ai-chat-security-simulation.sh \
  scripts/isolated-loopback-network-guard.cjs >"$EVIDENCE_DIR/source-manifest.sha256"
SOURCE_MANIFEST_SHA256="$(sha256sum "$EVIDENCE_DIR/source-manifest.sha256" | cut -d' ' -f1)"
export NP_SOURCE_MANIFEST_SHA256="$SOURCE_MANIFEST_SHA256"
export NP_TEST_RUNNER_SHA256="$(sha256sum scripts/test-ai-chat-security-simulation.sh | cut -d' ' -f1)"
export NP_TEST_FILE_SHA256="$(sha256sum artifacts/api-server/src/routes/ai-chat-security.simulation.integration.test.ts | cut -d' ' -f1)"
export NP_NETWORK_GUARD_SHA256="$(sha256sum scripts/isolated-loopback-network-guard.cjs | cut -d' ' -f1)"
printf 'Source manifest SHA-256: %s\n' "$SOURCE_MANIFEST_SHA256" >>"$EVIDENCE_DIR/run-metadata.txt"
printf 'Source file hashes are in source-manifest.sha256\n' >>"$EVIDENCE_DIR/run-metadata.txt"
: >"$EVIDENCE_DIR/blocked-egress.jsonl"
chmod 600 "$EVIDENCE_DIR/source-manifest.sha256" "$EVIDENCE_DIR/blocked-egress.jsonl"

"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$PGDATA" \
  >"$EVIDENCE_DIR/initdb.log" 2>&1
"$PG_BIN/pg_ctl" -D "$PGDATA" -l "$EVIDENCE_DIR/postgres.log" \
  -o "-h 127.0.0.1 -p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start \
  >"$EVIDENCE_DIR/postgres-start.log" 2>&1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U runner np_ai_chat_security_test

export DATABASE_URL="postgres://runner@127.0.0.1:$PORT/np_ai_chat_security_test"
export AI_CHAT_TEST_DATABASE_URL="$DATABASE_URL"
export AI_CHAT_TEST_ROOT="$TEST_ROOT/work"
export AI_CHAT_TEST_EVIDENCE_DIR="$EVIDENCE_DIR"
export NP_TEST_EVIDENCE_DIR="$EVIDENCE_DIR"
export NP_TEST_STARTED_AT="$STARTED_AT"
export NP_APP_COMMIT="$(git rev-parse HEAD)"
export NODE_OPTIONS="--require=$ROOT/scripts/isolated-loopback-network-guard.cjs"
export FILE_ENCRYPTION_KEY="$(printf 'd%.0s' {1..64})"
export PRIVATE_OBJECT_DIR="np-ai-chat-test/private"
export PUBLIC_OBJECT_SEARCH_PATHS="np-ai-chat-test/public"
export REPLIT_CONNECTORS_ENABLED=false
export NODE_ENV=test
export NEUROPATH_AI_DISABLED=false
unset AI_INTEGRATIONS_ANTHROPIC_API_KEY AI_INTEGRATIONS_ANTHROPIC_BASE_URL \
  ANTHROPIC_API_KEY GOOGLE_APPLICATION_CREDENTIALS \
  AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY \
  REPLIT_DATABASE_URL || true

{
  printf 'Schema push started UTC: %s\n' "$(date -u +%FT%TZ)"
  pnpm --filter @workspace/db run push
  printf 'Schema push completed UTC: %s\n' "$(date -u +%FT%TZ)"
} >"$EVIDENCE_DIR/schema-push.log" 2>&1

TEST_EXIT=0
: >"$EVIDENCE_DIR/test-run.log"
run_check() {
  local name="$1"
  shift
  local started ended code
  started="$(date -u +%FT%TZ)"
  printf '\n[%s] START %s\n' "$started" "$name" | tee -a "$EVIDENCE_DIR/test-run.log"
  set +e
  "$@" 2>&1 | tee -a "$EVIDENCE_DIR/test-run.log"
  code=${PIPESTATUS[0]}
  set -e
  ended="$(date -u +%FT%TZ)"
  if [[ "$code" -eq 0 ]]; then
    printf '[%s] PASS %s\n' "$ended" "$name" | tee -a "$EVIDENCE_DIR/test-run.log"
  else
    printf '[%s] FAIL %s (exit %s)\n' "$ended" "$name" "$code" | tee -a "$EVIDENCE_DIR/test-run.log"
    TEST_EXIT=1
  fi
}

run_check "isolated route/API integration tests" \
  pnpm --filter @workspace/api-server exec tsx --test \
  src/routes/ai-chat-security.simulation.integration.test.ts
run_check "server AI policy and rate-limit unit tests" \
  pnpm --filter @workspace/api-server exec tsx --test \
  src/lib/aiChatPolicy.test.ts src/lib/parentChatPolicy.test.ts src/lib/aiOperationalControls.test.ts
run_check "web AI request-shape unit tests" \
  pnpm --filter @workspace/neuropath exec vitest run --config vitest.config.ts src/api/entities.test.js
if grep -Eiq \
  'AUTHORIZED_DOCUMENT_CONTEXT_MARKER|FOREIGN_CHILD_DOCUMENT_MARKER|FORGED_SYSTEM_INSTRUCTION_MARKER|FAMILY_SIBLING_PLAN_SENTINEL|ANCHOR_CHILD_ONLY_PLAN_SENTINEL|Synthetic failure marker|fictional-(client|family)-(session|owner-session)' \
  "$EVIDENCE_DIR/test-run.log"; then
  printf 'FAIL: synthetic private-content sentinel appeared in test output; matched text withheld.\n' \
    | tee -a "$EVIDENCE_DIR/test-run.log"
  TEST_EXIT=1
else
  printf 'PASS: no synthetic document, prompt, or session sentinel appeared in captured logs.\n' \
    | tee -a "$EVIDENCE_DIR/test-run.log"
fi

printf 'Test exit code: %s\n' "$TEST_EXIT" >>"$EVIDENCE_DIR/run-metadata.txt"
printf 'All database and file-storage fixtures are disposable and removed by the exit trap.\n' \
  >"$EVIDENCE_DIR/isolation.txt"
chmod 600 "$EVIDENCE_DIR/isolation.txt"
printf 'Private evidence saved at %s\n' "$EVIDENCE_DIR"
exit "$TEST_EXIT"
