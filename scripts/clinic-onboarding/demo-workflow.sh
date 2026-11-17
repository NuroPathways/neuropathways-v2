#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-}"
if [[ "$MODE" != "fresh" && "$MODE" != "populated" ]]; then
  echo "Usage: scripts/clinic-onboarding/demo-workflow.sh fresh|populated" >&2
  exit 2
fi

DEMO_ROOT="$ROOT/.local/clinic-onboarding-demo"
EVIDENCE_ROOT="$ROOT/.local/verification/clinic-onboarding-demo"
mkdir -m 700 -p "$DEMO_ROOT" "$EVIDENCE_ROOT"
chmod 700 "$DEMO_ROOT" "$EVIDENCE_ROOT"
ACTIVE_MARKER="$DEMO_ROOT/active-$MODE.json"
if [[ -e "$ACTIVE_MARKER" ]]; then
  active_pid="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid||"")}catch{}' "$ACTIVE_MARKER")"
  if [[ "$active_pid" =~ ^[0-9]+$ ]] && kill -0 "$active_pid" 2>/dev/null; then
    echo "An isolated demo is already running. Stop or reset only that demo before starting another." >&2
    exit 3
  fi
  echo "A prior demo marker exists without a live owner. Inspect it and use the guarded reset command; no files were changed." >&2
  exit 3
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
RUN_DIR="$DEMO_ROOT/run-$STAMP-$RUN_ID"
PRIVATE="$RUN_DIR/private"
LOG_DIR="$EVIDENCE_ROOT/$STAMP"
mkdir -m 700 -p "$PRIVATE/pgdata" "$PRIVATE/storage" "$PRIVATE/public" "$LOG_DIR"
chmod 700 "$RUN_DIR" "$PRIVATE" "$PRIVATE/pgdata" "$PRIVATE/storage" "$PRIVATE/public" "$LOG_DIR"
PG_CTL=""
for candidate in /nix/store/*postgresql-*/bin/pg_ctl; do
  if [[ -x "$candidate" ]]; then PG_CTL="$candidate"; fi
done
if [[ -z "$PG_CTL" ]]; then
  echo "PostgreSQL tools were not found; no demo database was created." >&2
  rm -rf -- "$RUN_DIR"
  exit 4
fi
PG_BIN="$(dirname "$PG_CTL")"
pick_port() {
  node --input-type=module -e 'import net from "node:net";const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}
PG_PORT="$(pick_port)"
API_PORT="$(pick_port)"
WEB_PORT="${PORT:-5173}"
if ! [[ "$WEB_PORT" =~ ^[0-9]+$ ]] || (( WEB_PORT < 1024 || WEB_PORT > 65535 )); then
  echo "The isolated demo preview port is invalid; no database was created." >&2
  rm -rf -- "$RUN_DIR"
  exit 4
fi
SOCKET_DIR="$(mktemp -d /tmp/np-clinic-demo-sock.XXXXXX)"
chmod 700 "$SOCKET_DIR"
PG_STARTED=0
SERVER_PID=""
CLEANUP_DONE=0
DB_URL="postgres://runner@127.0.0.1:$PG_PORT/np_demo_clinic_onboarding"
EVIDENCE_DIR="$LOG_DIR"
export PATH="$PG_BIN:$PATH"
unset DATABASE_URL
unset REPL_ID REPL_SLUG REPLIT_DOMAINS
unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CLOUD_PROJECT
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL AI_INTEGRATIONS_ANTHROPIC_API_KEY AI_INTEGRATIONS_ANTHROPIC_BASE_URL
unset AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY AI_INTEGRATIONS_OPENROUTER_API_KEY
unset OPENAI_API_KEY OPENAI_BASE_URL GEMINI_API_KEY GOOGLE_API_KEY OPENROUTER_API_KEY
unset RESEND_API_KEY RESEND_API_URL
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset DEFAULT_OBJECT_STORAGE_BUCKET_ID PUBLIC_OBJECT_SEARCH_PATHS
export NODE_ENV=test
export REPLIT_CONNECTORS_ENABLED=false
export NP_CLINIC_ONBOARDING_DEMO_MODE=1
export NP_CLINIC_ONBOARDING_DEMO_INBOX=1
export SESSION_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("hex"))')"
export FILE_ENCRYPTION_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
export PRIVATE_OBJECT_DIR="$PRIVATE/storage"
export NP_TEST_STORAGE_DIR="$PRIVATE/storage"
export NP_DEMO_PRIVATE_DIR="$PRIVATE"
export NP_DEMO_CREDENTIALS_FILE="$PRIVATE/credentials.json"
export NP_DEMO_PUBLIC_DIR="$PRIVATE/public"
export NP_DEMO_EVIDENCE_DIR="$EVIDENCE_DIR"
export NP_TEST_EVIDENCE_DIR="$EVIDENCE_DIR"
export NP_DEMO_API_PORT="$API_PORT"
export NP_CLINIC_INVITATION_BASE_URL="http://127.0.0.1:$WEB_PORT/ClinicInvitation"
export PORT="$WEB_PORT"
export BASE_PATH="/"
export DATABASE_URL="$DB_URL"
export CORS_ORIGIN="http://127.0.0.1:$WEB_PORT"
if [[ -n "${REPLIT_DEV_DOMAIN:-}" ]]; then
  export CORS_ORIGIN="$CORS_ORIGIN,https://${REPLIT_DEV_DOMAIN}"
fi
export NODE_OPTIONS="--require=$ROOT/scripts/isolated-loopback-network-guard.cjs"

cleanup() {
  local prior=$?
  if [[ "$CLEANUP_DONE" == "1" ]]; then return; fi
  CLEANUP_DONE=1
  trap - EXIT INT TERM
  set +e
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  if [[ "$PG_STARTED" == "1" ]]; then
    pnpm --filter @workspace/api-server exec tsx ../../scripts/clinic-onboarding/export-demo-audit.mts \
      >>"$LOG_DIR/audit-export.log" 2>&1
    "$PG_CTL" -D "$PRIVATE/pgdata" -m fast stop >>"$LOG_DIR/postgres-stop.log" 2>&1
  fi
  rm -f "$PRIVATE/credentials.json"
  rm -rf -- "$PRIVATE" "$SOCKET_DIR"
  rm -f "$ACTIVE_MARKER"
  printf 'Demo state, local credentials, isolated PostgreSQL files, and private object storage were removed. Sanitized audit evidence was retained separately.\n' >"$LOG_DIR/cleanup-status.txt"
  printf 'Finished UTC: %s\n' "$(date -u +%FT%TZ)" >>"$LOG_DIR/run-info.txt"
  exit "$prior"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

{
  printf 'Run ID: %s\nMode: %s\nStarted UTC: %s\n' "$RUN_ID" "$MODE" "$(date -u +%FT%TZ)"
  printf 'Database name: np_demo_clinic_onboarding\nDatabase host: 127.0.0.1\n'
  printf 'Connectors: disabled\nLive AI/email: not configured or called\n'
  printf 'Preview port: %s\n' "$WEB_PORT"
  printf 'Git commit: %s\n' "$(git -C "$ROOT" rev-parse HEAD)"
} >"$LOG_DIR/run-info.txt"
chmod 600 "$LOG_DIR/run-info.txt"

"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$PRIVATE/pgdata" \
  >"$LOG_DIR/initdb.log" 2>&1
"$PG_CTL" -D "$PRIVATE/pgdata" -l "$LOG_DIR/postgres.log" \
  -o "-h 127.0.0.1 -p $PG_PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start \
  >"$LOG_DIR/postgres-start.log" 2>&1
PG_STARTED=1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U runner np_demo_clinic_onboarding
if ! grep -q '127.0.0.1' <<<"$DATABASE_URL"; then
  echo "Loopback database guard failed; refusing to initialize the schema." >&2
  exit 5
fi
pnpm --filter @workspace/db run push >"$LOG_DIR/schema-push.log" 2>&1

pnpm --filter @workspace/api-server exec tsx ../../scripts/clinic-onboarding/demo-fixtures.mts "$MODE" \
  >"$LOG_DIR/seed-first.json" 2>"$LOG_DIR/seed-first.err"
# An identical second invocation must be idempotent and must not print or
# regenerate any credential values.
pnpm --filter @workspace/api-server exec tsx ../../scripts/clinic-onboarding/demo-fixtures.mts "$MODE" \
  >"$LOG_DIR/seed-repeat.json" 2>"$LOG_DIR/seed-repeat.err"
chmod 600 "$LOG_DIR"/seed-*.json "$LOG_DIR"/seed-*.err

# Never copy credentials; preserve only the private file location.
printf 'Private credentials are available only while the demo runs at: %s\n' "$PRIVATE/credentials.json" \
  >"$LOG_DIR/credentials-file-location.txt"
chmod 600 "$LOG_DIR/credentials-file-location.txt"

PORT="$WEB_PORT" BASE_PATH="/" VITE_CLINIC_ONBOARDING_DEMO_INBOX=1 pnpm --filter @workspace/neuropath exec vite build --config vite.config.ts --outDir "$PRIVATE/public" \
  >"$LOG_DIR/web-build.log" 2>&1
cat >"$PRIVATE/run-marker.json" <<JSON
{"runId":"$RUN_ID","mode":"$MODE","pid":$$,"databaseName":"np_demo_clinic_onboarding","databaseHost":"127.0.0.1","privateDir":"$PRIVATE","port":$WEB_PORT,"createdAt":"$(date -u +%FT%TZ)"}
JSON
chmod 600 "$PRIVATE/run-marker.json"
cp "$PRIVATE/run-marker.json" "$LOG_DIR/run-marker.json"
chmod 600 "$LOG_DIR/run-marker.json"
cat >"$ACTIVE_MARKER" <<JSON
{"runId":"$RUN_ID","mode":"$MODE","pid":$$,"databaseName":"np_demo_clinic_onboarding","databaseHost":"127.0.0.1","privateDir":"$PRIVATE","port":$WEB_PORT}
JSON
chmod 600 "$ACTIVE_MARKER"

echo "Starting the fictional $MODE clinic demo on isolated preview port $WEB_PORT."
echo "Login details are stored in a private file under .local; they are not printed or archived."
pnpm --filter @workspace/api-server exec tsx ../../scripts/clinic-onboarding/demo-server.mts \
  >"$LOG_DIR/demo-server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do
  if curl --silent --fail "http://127.0.0.1:$WEB_PORT/" >/dev/null; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "$LOG_DIR/demo-server.log" >&2
    exit 6
  fi
  sleep 0.25
done
if ! curl --silent --fail "http://127.0.0.1:$WEB_PORT/" >/dev/null; then
  echo "The isolated web demo did not become ready on its loopback port." >&2
  exit 6
fi
NP_DEMO_MODE="$MODE" \
NP_DEMO_SMOKE_PORT="$WEB_PORT" \
NP_DEMO_SMOKE_EVIDENCE="$LOG_DIR" \
CHROMIUM_PATH=/repl/tools/bin/chromium \
  pnpm --filter @workspace/api-server exec tsx ../../scripts/clinic-onboarding/demo-browser-smoke.mts \
  >"$LOG_DIR/demo-browser-smoke.log" 2>&1
wait "$SERVER_PID"
