#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_ROOT="${NP_CLINIC_ONBOARDING_EVIDENCE_ROOT:-$ROOT/.local/verification/clinic-onboarding-first-slice-$STAMP}"
ATTEMPT="$EVIDENCE_ROOT/api-$STAMP"
PRIVATE="$ATTEMPT/private-run"
if [[ -e "$ATTEMPT" ]]; then
  echo "Refusing to overwrite existing evidence: $ATTEMPT" >&2
  exit 2
fi
mkdir -m 700 -p "$PRIVATE/pgdata" "$PRIVATE/storage"
mkdir -m 700 -p "$ATTEMPT/logs"

PG_CTL=""
for candidate in /nix/store/*postgresql-*/bin/pg_ctl; do
  if [[ -x "$candidate" ]]; then PG_CTL="$candidate"; fi
done
if [[ -z "$PG_CTL" || ! -x "$PG_CTL" ]]; then
  echo "PostgreSQL tools were not found; no test was run." >&2
  exit 3
fi
PG_BIN="$(dirname "$PG_CTL")"

pick_port() {
  node --input-type=module -e 'import net from "node:net";const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

PG_PORT="$(pick_port)"
SOCKET_DIR="$(mktemp -d /tmp/np-clinic-onboarding-sock.XXXXXX)"
chmod 700 "$SOCKET_DIR"
PG_STARTED=0
TEST_STATUS=0
unset DATABASE_URL
unset REPL_ID REPLIT_DOMAINS REPLIT_DEV_DOMAIN
unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CLOUD_PROJECT
unset ANTHROPIC_API_KEY AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_GEMINI_API_KEY
unset GOOGLE_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset DEFAULT_OBJECT_STORAGE_BUCKET_ID PUBLIC_OBJECT_SEARCH_PATHS
export PATH="$PG_BIN:$PATH"
export NODE_ENV=test
export REPLIT_CONNECTORS_ENABLED=false
export SESSION_SECRET="isolated-clinic-onboarding-session-secret"
export FILE_ENCRYPTION_KEY="$(printf 'b%.0s' {1..64})"
export PRIVATE_OBJECT_DIR="clinic-onboarding-test/fictional"
export NP_TEST_EVIDENCE_DIR="$ATTEMPT"
export NP_TEST_STORAGE_DIR="$PRIVATE/storage"
export DISABLE_RATE_LIMIT=true
export NODE_OPTIONS="--require=$ROOT/scripts/isolated-loopback-network-guard.cjs"

{
  printf 'Started UTC: %s\n' "$(date -u +%FT%TZ)"
  printf 'HEAD: %s\n' "$(git -C "$ROOT" rev-parse HEAD)"
  printf 'Branch: %s\n' "$(git -C "$ROOT" branch --show-current)"
  printf 'Git status before:\n'
  git -C "$ROOT" status --short
  printf '\nTracked application diff (before):\n'
  git -C "$ROOT" diff --binary HEAD -- artifacts/api-server artifacts/neuropath lib
  printf '\nUntracked application-file checksums (before):\n'
  git -C "$ROOT" ls-files --others --exclude-standard -z -- artifacts/api-server artifacts/neuropath lib \
    | xargs -0 -r sha256sum
} >"$ATTEMPT/code-state-before.txt"
chmod 600 "$ATTEMPT/code-state-before.txt"

cleanup() {
  set +e
  if [[ "$PG_STARTED" == "1" ]]; then
    "$PG_CTL" -D "$PRIVATE/pgdata" -m fast stop >>"$ATTEMPT/logs/postgres-stop.log" 2>&1
  fi
  rm -rf -- "$PRIVATE" "$SOCKET_DIR"
  printf 'Stopped only the isolated PostgreSQL cluster; removed its database files and private test storage. Sanitized evidence retained.\n' >"$ATTEMPT/cleanup-status.txt"
  printf 'Finished UTC: %s\n' "$(date -u +%FT%TZ)" >>"$ATTEMPT/code-state-before.txt"
  {
    printf 'Git status after:\n'
    git -C "$ROOT" status --short
    printf '\nTracked application diff (after):\n'
    git -C "$ROOT" diff --binary HEAD -- artifacts/api-server artifacts/neuropath lib
    printf '\nUntracked application-file checksums (after):\n'
    git -C "$ROOT" ls-files --others --exclude-standard -z -- artifacts/api-server artifacts/neuropath lib \
      | xargs -0 -r sha256sum
  } >"$ATTEMPT/code-state-after.txt"
  chmod 600 "$ATTEMPT/"*.txt "$ATTEMPT/logs/"* 2>/dev/null
  if [[ -f "$ATTEMPT/code-state-before.txt" && -f "$ATTEMPT/code-state-after.txt" ]]; then
    git -C "$ROOT" status --porcelain=v1 --untracked-files=all >"$ATTEMPT/git-status-after.txt"
  fi
}
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" --auth-local=trust --auth-host=trust --username=runner -D "$PRIVATE/pgdata" \
  >"$ATTEMPT/logs/initdb.log" 2>&1
"$PG_CTL" -D "$PRIVATE/pgdata" -l "$ATTEMPT/logs/postgres.log" \
  -o "-h 127.0.0.1 -p $PG_PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start \
  >"$ATTEMPT/logs/postgres-start.log" 2>&1
PG_STARTED=1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U runner np_clinic_onboarding_test
export DATABASE_URL="postgres://runner@127.0.0.1:$PG_PORT/np_clinic_onboarding_test"
export CLINIC_ONBOARDING_TEST_DATABASE_URL="$DATABASE_URL"
export CORS_ORIGIN="http://127.0.0.1:4173"
export NP_CLINIC_INVITATION_BASE_URL="http://127.0.0.1:4173/ClinicInvitation"

{
  printf 'Database: '
  "$PG_BIN/psql" "$DATABASE_URL" -Atc "select current_database() || '|' || host(inet_server_addr())"
  printf 'Connectors: %s\n' "$REPLIT_CONNECTORS_ENABLED"
  printf 'AI: disabled/not called\nStorage: private temporary local directory; no external storage\nMail: in-process loopback-only test sink\n'
  printf 'Network guard: Node non-loopback sockets and DNS rejected; browser checks use a separate deny-only proxy.\n'
} >"$ATTEMPT/isolation-check.txt"
if ! grep -Fq "np_clinic_onboarding_test|127.0.0.1" "$ATTEMPT/isolation-check.txt"; then
  echo "Isolation guard failed; refusing to run tests." >"$ATTEMPT/runner-errors.txt"
  exit 4
fi

# Model the pre-onboarding users/clinics schema, then apply the additive upgrade
# before Drizzle fills the remaining application tables in this disposable DB.
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

set +e
pnpm --filter @workspace/db run push >"$ATTEMPT/logs/schema-push.log" 2>&1
schema_status=$?
set -e
printf 'additive_migration_exit=0\nschema_push_exit=%s\n' "$schema_status" >"$ATTEMPT/test-status.txt"
if [[ "$schema_status" -ne 0 ]]; then
  echo "Isolated schema setup failed; no application tests were run." >"$ATTEMPT/runner-errors.txt"
  exit "$schema_status"
fi

set +e
pnpm --filter @workspace/api-server exec tsx --test \
  src/routes/clinic-onboarding.integration.test.ts \
  src/lib/clinicInvitationSecurity.test.ts \
  src/lib/clinicInvitationDelivery.test.ts \
  src/lib/platformAdminBootstrap.test.ts \
  src/middlewares/pendingClinicianAccessGuard.test.ts \
  >"$ATTEMPT/logs/test-run.log" 2>&1
test_status=$?
set -e
printf 'api_tests_exit=%s\n' "$test_status" >>"$ATTEMPT/test-status.txt"
exit "$test_status"
