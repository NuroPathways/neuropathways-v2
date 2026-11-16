#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_ROOT="${NP_CLINIC_ONBOARDING_BROWSER_EVIDENCE_ROOT:-$ROOT/.local/verification/clinic-onboarding-browser-$STAMP}"
ATTEMPT="$EVIDENCE_ROOT/run-$STAMP"
PRIVATE="$ATTEMPT/private-run"
if [[ -e "$ATTEMPT" ]]; then
  echo "Refusing to overwrite existing evidence: $ATTEMPT" >&2
  exit 2
fi
mkdir -m 700 -p "$PRIVATE/pgdata" "$PRIVATE/storage" "$ATTEMPT/logs" "$ATTEMPT/screenshots"

PG_CTL=""
for candidate in /nix/store/*postgresql-*/bin/pg_ctl; do
  [[ -x "$candidate" ]] && PG_CTL="$candidate"
done
if [[ -z "$PG_CTL" ]]; then
  echo "PostgreSQL tools were not found; no browser test was run." >&2
  exit 3
fi
PG_BIN="$(dirname "$PG_CTL")"
pick_port() {
  node --input-type=module -e 'import net from "node:net";const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}
PG_PORT="$(pick_port)"
API_PORT="$(pick_port)"
WEB_PORT="$(pick_port)"
CDP_PORT="$(pick_port)"
SOCKET_DIR="$(mktemp -d /tmp/np-clinic-onboarding-browser-sock.XXXXXX)"
chmod 700 "$SOCKET_DIR"
PG_STARTED=0
DIST_SAVED=0
unset DATABASE_URL REPL_ID REPLIT_DOMAINS REPLIT_DEV_DOMAIN
unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CLOUD_PROJECT
unset ANTHROPIC_API_KEY AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY
unset GOOGLE_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset DEFAULT_OBJECT_STORAGE_BUCKET_ID PUBLIC_OBJECT_SEARCH_PATHS
export PATH="$PG_BIN:$PATH"
export NODE_ENV=test
export REPLIT_CONNECTORS_ENABLED=false
export SESSION_SECRET="isolated-browser-session-secret-only"
export FILE_ENCRYPTION_KEY="$(printf 'c%.0s' {1..64})"
export PRIVATE_OBJECT_DIR="clinic-onboarding-browser-test/fictional"
export NP_TEST_EVIDENCE_DIR="$ATTEMPT"
export NP_TEST_STORAGE_DIR="$PRIVATE/storage"
export NP_DEMO_PRIVATE_DIR="$PRIVATE/demo-private"
export NP_TEST_API_PORT="$API_PORT"
export PORT="$WEB_PORT"
export BASE_PATH="/"
export CORS_ORIGIN="http://127.0.0.1:$WEB_PORT"
export NP_CLINIC_INVITATION_BASE_URL="http://127.0.0.1:$WEB_PORT/ClinicInvitation"
export DISABLE_RATE_LIMIT=true
export NODE_OPTIONS="--require=$ROOT/scripts/isolated-loopback-network-guard.cjs"
export CHROMIUM_PATH="$(find /repl/tools -type f -path '*/bin/chromium' -executable -print -quit)"
export NP_CDP_PORT="$CDP_PORT"
export NP_TEST_STORAGE_ROOT="$PRIVATE/storage"
export NP_TEST_WEB_URL="http://127.0.0.1:$WEB_PORT"

{
  printf 'Started UTC: %s\n' "$(date -u +%FT%TZ)"
  printf 'HEAD: %s\n' "$(git -C "$ROOT" rev-parse HEAD)"
  printf 'Branch: %s\n' "$(git -C "$ROOT" branch --show-current)"
  printf 'Working tree:\n'
  git -C "$ROOT" status --short
  printf '\nApplication file checksums before:\n'
  git -C "$ROOT" ls-files --others --exclude-standard -z -- artifacts/api-server artifacts/neuropath lib scripts/clinic-onboarding \
    | xargs -0 -r sha256sum
} >"$ATTEMPT/code-state-before.txt"

cleanup() {
  set +e
  if [[ -d "$ROOT/artifacts/neuropath/dist/public/assets" ]]; then
    find "$ROOT/artifacts/neuropath/dist/public/assets" -maxdepth 1 -type f -name '*.js.map' -exec cp -- {} "$ATTEMPT/" \;
  fi
  if [[ "$DIST_SAVED" == "1" && -d "$PRIVATE/preexisting-dist" ]]; then
    rm -rf -- "$ROOT/artifacts/neuropath/dist"
    mv -- "$PRIVATE/preexisting-dist" "$ROOT/artifacts/neuropath/dist"
    DIST_SAVED=0
  fi
  if [[ "$PG_STARTED" == "1" ]]; then
    "$PG_CTL" -D "$PRIVATE/pgdata" -m fast stop >>"$ATTEMPT/logs/postgres-stop.log" 2>&1
  fi
  rm -rf -- "$PRIVATE" "$SOCKET_DIR"
  {
    printf 'Only the isolated loopback PostgreSQL cluster and its private storage were removed.\n'
    printf 'The browser harness stops only its own Chromium, API and Vite processes.\n'
    printf 'Sanitized results and screenshots retained.\n'
    printf 'Finished UTC: %s\n' "$(date -u +%FT%TZ)"
  } >"$ATTEMPT/cleanup-status.txt"
  git -C "$ROOT" status --short >"$ATTEMPT/git-status-after.txt"
  git -C "$ROOT" ls-files --others --exclude-standard -z -- artifacts/api-server artifacts/neuropath lib scripts/clinic-onboarding \
    | xargs -0 -r sha256sum >"$ATTEMPT/application-checksums-after.txt"
}
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$PRIVATE/pgdata" \
  >"$ATTEMPT/logs/initdb.log" 2>&1
"$PG_CTL" -D "$PRIVATE/pgdata" -l "$ATTEMPT/logs/postgres.log" \
  -o "-h 127.0.0.1 -p $PG_PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start \
  >"$ATTEMPT/logs/postgres-start.log" 2>&1
PG_STARTED=1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U runner np_clinic_onboarding_browser_test
export DATABASE_URL="postgres://runner@127.0.0.1:$PG_PORT/np_clinic_onboarding_browser_test"
export CLINIC_ONBOARDING_TEST_DATABASE_URL="$DATABASE_URL"

{
  printf 'Database: '
  "$PG_BIN/psql" "$DATABASE_URL" -Atc "select current_database() || '|' || host(inet_server_addr())"
  printf 'Connectors: %s\n' "$REPLIT_CONNECTORS_ENABLED"
  printf 'AI: not configured or called\nStorage: %s (temporary local-only)\n' "$NP_TEST_STORAGE_DIR"
  printf 'Email: in-process loopback sink only; no external delivery\n'
  printf 'Browser: headless Chromium with external DNS disabled; application/API bound to loopback\n'
} >"$ATTEMPT/isolation-check.txt"
if ! grep -Fq "np_clinic_onboarding_browser_test|127.0.0.1" "$ATTEMPT/isolation-check.txt"; then
  echo "Isolation guard failed; refusing browser tests." >"$ATTEMPT/runner-errors.txt"
  exit 4
fi

"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$ATTEMPT/logs/baseline-schema.log" 2>&1 <<'SQL'
CREATE TABLE users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE,
  first_name varchar,
  last_name varchar,
  profile_image_url varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE clinics (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(200) NOT NULL,
  legacy_tenant_id varchar,
  status varchar NOT NULL DEFAULT 'pending',
  created_by varchar REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
SQL
"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f "$ROOT/lib/db/migrations/20261116_clinic_onboarding_invitations.sql" \
  >"$ATTEMPT/logs/clinic-onboarding-migration.log" 2>&1
if ! pnpm --filter @workspace/db run push >"$ATTEMPT/logs/schema-push.log" 2>&1; then
  echo "Isolated schema setup failed; browser tests were not run." >"$ATTEMPT/runner-errors.txt"
  exit 5
fi

cp -a "$ROOT/artifacts/neuropath/dist" "$PRIVATE/preexisting-dist"
DIST_SAVED=1
if ! pnpm --filter @workspace/neuropath exec vite build --config vite.config.ts --sourcemap >"$ATTEMPT/logs/web-build.log" 2>&1; then
  echo "The isolated web build failed; browser checks were not run." >"$ATTEMPT/runner-errors.txt"
  exit 6
fi

export NP_TEST_BROWSER_EVIDENCE_DIR="$ATTEMPT"
export NP_TEST_BROWSER_EXPECTED_DATABASE="np_clinic_onboarding_browser_test"
set +e
pnpm --filter @workspace/api-server exec tsx ../../scripts/clinic-onboarding/browser-e2e.mts \
  >"$ATTEMPT/logs/browser-run.log" 2>&1
RUN_STATUS=$?
set -e
printf 'browser_e2e_exit=%s\n' "$RUN_STATUS" >"$ATTEMPT/test-status.txt"
exit "$RUN_STATUS"
