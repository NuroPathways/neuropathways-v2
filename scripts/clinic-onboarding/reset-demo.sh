#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_ROOT="$ROOT/.local/clinic-onboarding-demo"
MODE="${1:-}"
CONFIRM="${2:-}"
if [[ "$MODE" != "fresh" && "$MODE" != "populated" ]]; then
  echo "Usage: scripts/clinic-onboarding/reset-demo.sh fresh|populated --confirm=RESET-ISOLATED-CLINIC-DEMO" >&2
  exit 2
fi
ACTIVE_MARKER="$DEMO_ROOT/active-$MODE.json"
if [[ ! -f "$ACTIVE_MARKER" && -f "$DEMO_ROOT/active-run.json" ]]; then
  legacy_mode="$(jq -r '.mode // empty' "$DEMO_ROOT/active-run.json")"
  if [[ "$legacy_mode" == "$MODE" ]]; then ACTIVE_MARKER="$DEMO_ROOT/active-run.json"; fi
fi
if [[ "$CONFIRM" != "--confirm=RESET-ISOLATED-CLINIC-DEMO" ]]; then
  echo "Refusing reset. To stop and discard only the isolated $MODE demo, rerun with --confirm=RESET-ISOLATED-CLINIC-DEMO." >&2
  exit 2
fi
if [[ ! -f "$ACTIVE_MARKER" ]]; then
  echo "No active isolated demo marker exists; no files or processes were changed."
  exit 0
fi

database_name="$(jq -r '.databaseName // empty' "$ACTIVE_MARKER")"
database_host="$(jq -r '.databaseHost // empty' "$ACTIVE_MARKER")"
pid="$(jq -r '.pid // empty' "$ACTIVE_MARKER")"
private_dir="$(jq -r '.privateDir // empty' "$ACTIVE_MARKER")"
mode="$(jq -r '.mode // empty' "$ACTIVE_MARKER")"
if [[ "$database_name" != "np_demo_clinic_onboarding" ||
      "$database_host" != "127.0.0.1" ||
      ! "$pid" =~ ^[0-9]+$ ||
      "$mode" != "$MODE" ||
      "$private_dir" != "$DEMO_ROOT"/run-*/private ]]; then
  echo "The demo marker did not match the exact private loopback demo; reset stopped without changes." >&2
  exit 3
fi
if ! kill -0 "$pid" 2>/dev/null; then
  echo "The recorded demo owner is not running. Inspect the private marker and logs before cleanup; no files were removed." >&2
  exit 3
fi
command_line="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
if [[ "$command_line" != *"demo-workflow.sh"* || "$command_line" != *"$mode"* ]]; then
  echo "The recorded PID is not the isolated demo workflow; reset stopped without signaling it." >&2
  exit 3
fi

PG_CTL=""
for candidate in /nix/store/*postgresql-*/bin/pg_ctl; do
  if [[ -x "$candidate" ]]; then PG_CTL="$candidate"; fi
done
if [[ -z "$PG_CTL" || ! -d "$private_dir/pgdata" ]]; then
  echo "The private database directory could not be verified; reset stopped without changes." >&2
  exit 3
fi
if ! "$PG_CTL" -D "$private_dir/pgdata" status >/dev/null 2>&1; then
  echo "The isolated database is not running; reset stopped without deleting its files." >&2
  exit 3
fi

kill -TERM "$pid"
for _ in $(seq 1 120); do
  if [[ ! -e "$ACTIVE_MARKER" ]]; then
    echo "The isolated demo workflow stopped and removed only its private database, storage, and credentials. Sanitized demo audit evidence was retained."
    exit 0
  fi
  sleep 0.5
done
echo "The isolated demo did not finish cleanup within 60 seconds. No manual deletion was attempted; inspect its workflow logs." >&2
exit 4
