#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_ROOT="$ROOT/.local/clinic-onboarding-demo"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
RUN_DIR="$DEMO_ROOT/run-$STAMP-$RUN_ID"
PRIVATE="$RUN_DIR/private"
MARKER="$DEMO_ROOT/active-fresh.json"
EVIDENCE="$ROOT/.local/verification/clinic-onboarding-demo/$STAMP"
PORT="$(node --input-type=module -e 'import net from "node:net";const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"

if [[ -e "$MARKER" ]]; then
  echo "Blocked: another fresh demo marker exists; the test will not replace it." >&2
  exit 2
fi

mkdir -m 700 -p "$PRIVATE/pgdata" "$PRIVATE/storage" "$EVIDENCE"
printf '16\n' >"$PRIVATE/pgdata/PG_VERSION"
cat >"$MARKER" <<JSON
{"runId":"$RUN_ID","mode":"fresh","pid":99999999,"databaseName":"np_demo_clinic_onboarding","databaseHost":"127.0.0.1","privateDir":"$PRIVATE","port":$PORT}
JSON
chmod 600 "$MARKER"

cleanup_fixture() {
  if [[ -f "$MARKER" && "$(jq -r '.runId // empty' "$MARKER")" == "$RUN_ID" ]]; then
    rm -f -- "$MARKER"
  fi
  if [[ "$PRIVATE" == "$DEMO_ROOT"/run-*/private ]]; then
    rm -rf -- "$PRIVATE"
  fi
}
trap cleanup_fixture EXIT

"$ROOT/scripts/clinic-onboarding/reset-demo.sh" fresh --confirm=RESET-ISOLATED-CLINIC-DEMO

[[ ! -e "$MARKER" ]]
[[ ! -e "$PRIVATE" ]]
grep -q 'Orphaned isolated demo files were removed' "$EVIDENCE/cleanup-status.txt"
echo "PASS: stale marker cleanup removed only the isolated fixture after no live services were found."
