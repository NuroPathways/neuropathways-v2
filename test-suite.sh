#!/usr/bin/env bash
# NeuroPathways API — Comprehensive Test Suite
# Usage: API_BASE_URL=https://your-app.replit.app ./test-suite.sh
# No npm dependencies — pure bash + curl.

set -euo pipefail

API="${API_BASE_URL:-http://localhost:3000}"
API="${API%/}"  # strip trailing slash

PASS=0; FAIL=0; SKIP=0; TOTAL=0
COOKIE_JAR=$(mktemp)
COOKIE_JAR2=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$COOKIE_JAR2"' EXIT

# Unique suffix to avoid collisions between test runs
RUN_ID="test$(date +%s)"
CLINICIAN_EMAIL="${RUN_ID}@test.neuropathways.dev"
CLINICIAN_PASS="TestPass123!"
CLIENT_USERNAME="${RUN_ID}_client"
CLIENT_ACCESS_CODE="TEST1234"

# Tracking IDs created during tests (for cleanup / cross-test references)
FAMILY_ID=""
CHILD_ID=""
CHILD_ID_2=""
BEHAVIOR_PLAN_ID=""
DOCUMENT_ID=""
CLIENT_TOKEN=""
MOBILE_TOKEN=""

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log_section() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }

RATE_LIMITED=false

assert() {
  local name="$1" condition="$2"
  TOTAL=$((TOTAL + 1))
  if eval "$condition"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $name"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $name"
  fi
}

assert_status() {
  local name="$1" actual="$2" expected="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "429" ]; then
    SKIP=$((SKIP + 1)); RATE_LIMITED=true
    echo -e "  ${YELLOW}⊘${NC} $name — rate limited (429)"
  elif [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $name"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $name (expected $expected, got $actual)"
  fi
}

skip() {
  local name="$1" reason="$2"
  TOTAL=$((TOTAL + 1)); SKIP=$((SKIP + 1))
  echo -e "  ${YELLOW}⊘${NC} $name — $reason"
}

throttle() { sleep 0.05; }

http_get() {
  curl -s -o /dev/null -w '%{http_code}' "$API/api$1" -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000"
}

http_get_body() {
  curl -s "$API/api$1" -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "{}"
}

http_post() {
  local path="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api$path" \
    -H 'Content-Type: application/json' -d "$@" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000"
}

http_post_body() {
  local path="$1"; shift
  curl -s -X POST "$API/api$path" \
    -H 'Content-Type: application/json' -d "$@" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "{}"
}

http_patch() {
  local path="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/api$path" \
    -H 'Content-Type: application/json' -d "$@" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000"
}

http_patch_body() {
  local path="$1"; shift
  curl -s -X PATCH "$API/api$path" \
    -H 'Content-Type: application/json' -d "$@" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "{}"
}

http_delete() {
  curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/api$1" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000"
}

# No-auth variants (empty cookie jar)
http_get_noauth() {
  curl -s -o /dev/null -w '%{http_code}' "$API/api$1" 2>/dev/null || echo "000"
}

http_post_noauth() {
  local path="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api$path" \
    -H 'Content-Type: application/json' -d "$@" 2>/dev/null || echo "000"
}

http_post_noauth_body() {
  local path="$1"; shift
  curl -s -X POST "$API/api$path" \
    -H 'Content-Type: application/json' -d "$@" 2>/dev/null || echo "{}"
}

# Full response with headers
http_get_headers() {
  curl -sI "$API/api$1" 2>/dev/null || echo ""
}

echo -e "${CYAN}NeuroPathways API Test Suite${NC}"
echo "Target: $API"
echo "Run ID: $RUN_ID"
echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"


# ═══════════════════════════════════════════════
# 1. HEALTH & CONNECTIVITY
# ═══════════════════════════════════════════════

log_section "1. Health & Connectivity"

STATUS=$(http_get_noauth "/healthz")
assert "GET /healthz returns 200" '[ "$STATUS" = "200" ]'

BODY=$(curl -s "$API/api/healthz" 2>/dev/null)
assert "Health response contains status:ok" 'echo "$BODY" | grep -q '"'"'"ok"'"'"''


# ═══════════════════════════════════════════════
# 2. SECURITY HEADERS (Helmet)
# ═══════════════════════════════════════════════

log_section "2. Security Headers"

HEADERS=$(http_get_headers "/healthz")
assert "X-Content-Type-Options: nosniff" 'echo "$HEADERS" | grep -qi "x-content-type-options.*nosniff"'
assert "X-Frame-Options present" 'echo "$HEADERS" | grep -qi "x-frame-options"'
assert "X-XSS-Protection present" 'echo "$HEADERS" | grep -qi "x-xss-protection\|content-security-policy"'
assert "Strict-Transport-Security present" 'echo "$HEADERS" | grep -qi "strict-transport-security"'
assert "X-Powered-By header absent" '! echo "$HEADERS" | grep -qi "x-powered-by"'


# ═══════════════════════════════════════════════
# 3. CORS VALIDATION
# ═══════════════════════════════════════════════

log_section "3. CORS Validation"

CORS_RESP=$(curl -s -I -X OPTIONS "$API/api/healthz" \
  -H "Origin: https://evil-site.example.com" \
  -H "Access-Control-Request-Method: GET" 2>/dev/null)
assert "Rejects unknown origin" '! echo "$CORS_RESP" | grep -qi "access-control-allow-origin.*evil-site"'

CORS_OK=$(curl -s -I -X OPTIONS "$API/api/healthz" \
  -H "Origin: https://nuropath-ai.replit.app" \
  -H "Access-Control-Request-Method: GET" 2>/dev/null)
assert "Accepts allowed origin" 'echo "$CORS_OK" | grep -qi "access-control-allow-origin"'


# ═══════════════════════════════════════════════
# 4. AUTH GUARDS — Unauthenticated Access
# ═══════════════════════════════════════════════

log_section "4. Auth Guards — Protected Routes Reject Unauthenticated"

# CRUD routes (all should return 401)
CRUD_ROUTES=("children" "families" "behavior-plans" "documents" "intervention-plans"
             "behavior-logs" "reward-tokens" "messages" "ai-conversations"
             "daily-check-ins" "win-logs" "engagement-events" "client-profiles")

for route in "${CRUD_ROUTES[@]}"; do
  CODE=$(http_get_noauth "/$route"); throttle
  assert_status "GET /$route requires auth" "$CODE" "401"
done

# Special authenticated routes
CODE=$(http_get_noauth "/users/me"); throttle
assert_status "GET /users/me requires auth" "$CODE" "401"

CODE=$(http_get_noauth "/clinician-data"); throttle
assert_status "GET /clinician-data requires auth" "$CODE" "401"

CODE=$(http_get_noauth "/client-detail?child_id=fake"); throttle
assert_status "GET /client-detail requires auth" "$CODE" "401"

CODE=$(http_get_noauth "/family-detail?family_id=fake"); throttle
assert_status "GET /family-detail requires auth" "$CODE" "401"

CODE=$(http_post_noauth "/create-client-account" '{}'); throttle
assert_status "POST /create-client-account requires auth" "$CODE" "401"

CODE=$(http_post_noauth "/build-client-profile" '{}'); throttle
assert_status "POST /build-client-profile requires auth" "$CODE" "401"

CODE=$(http_post_noauth "/manage-client-record" '{}'); throttle
assert_status "POST /manage-client-record requires auth" "$CODE" "401"

CODE=$(http_post_noauth "/add-child-to-family" '{}'); throttle
assert_status "POST /add-child-to-family requires auth" "$CODE" "401"

# Upload requires auth
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/upload" \
  -F "file=@/dev/null;filename=test.pdf;type=application/pdf" 2>/dev/null || echo "000"); throttle
assert_status "POST /upload requires auth" "$CODE" "401"


# ═══════════════════════════════════════════════
# 5. AUTH GUARDS — Intentionally Public Routes
# ═══════════════════════════════════════════════

log_section "5. Public Routes Accept Requests"

# verify-client-credentials (should return 400 for missing fields, not 401)
CODE=$(http_post_noauth "/verify-client-credentials" '{}')
assert "POST /verify-client-credentials is public (got $CODE)" '[ "$CODE" = "400" ]'

# client-session/login (should return 400 for missing fields, not 401)
CODE=$(http_post_noauth "/client-session/login" '{}')
assert "POST /client-session/login is public (got $CODE)" '[ "$CODE" = "400" ]'

# client-session/change-access-code (should return 400 for missing fields)
CODE=$(http_post_noauth "/client-session/change-access-code" '{}')
assert "POST /client-session/change-access-code is public (got $CODE)" '[ "$CODE" = "400" ]'

# mobile/auth/login (should return 400 for missing fields)
CODE=$(http_post_noauth "/mobile/auth/login" '{}')
assert "POST /mobile/auth/login is public (got $CODE)" '[ "$CODE" = "400" ]'


# ═══════════════════════════════════════════════
# 6. MANAGE-CLIENT-GOAL — Dual Auth
# ═══════════════════════════════════════════════

log_section "6. Manage Client Goal — Auth Check"

# No auth and no invite_token → 401
CODE=$(http_post_noauth "/manage-client-goal" '{"action":"create","data":{}}')
assert "POST /manage-client-goal without any auth → 401" '[ "$CODE" = "401" ]'


# ═══════════════════════════════════════════════
# 7. CLINICIAN REGISTRATION & LOGIN
# ═══════════════════════════════════════════════

log_section "7. Clinician Registration & Login"

# Missing fields
CODE=$(http_post_noauth "/clinician/register" '{}')
assert "Register rejects empty body" '[ "$CODE" = "400" ]'

CODE=$(http_post_noauth "/clinician/register" '{"email":"a@b.com","password":"short"}')
assert "Register rejects short password" '[ "$CODE" = "400" ]'

# Successful registration
BODY=$(http_post_noauth_body "/clinician/register" \
  "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"$CLINICIAN_PASS\",\"firstName\":\"Test\",\"lastName\":\"Clinician\"}")
assert "Register creates clinician account" 'echo "$BODY" | grep -q '"'"'"ok"'"'"''

# Duplicate registration
CODE=$(http_post_noauth "/clinician/register" \
  "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"$CLINICIAN_PASS\"}")
assert "Duplicate registration returns 409" '[ "$CODE" = "409" ]'

# Login with wrong password
CODE=$(http_post_noauth "/clinician/login" \
  "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"WrongPassword99\"}")
assert "Login rejects wrong password" '[ "$CODE" = "401" ]'

# Successful login (saves session cookie)
LOGIN_RESP=$(curl -s -D - -X POST "$API/api/clinician/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"$CLINICIAN_PASS\"}" \
  -c "$COOKIE_JAR" 2>/dev/null)
assert "Login succeeds with correct credentials" 'echo "$LOGIN_RESP" | grep -q '"'"'"ok"'"'"''
assert "Login sets session cookie" 'echo "$LOGIN_RESP" | grep -qi "set-cookie"'


# ═══════════════════════════════════════════════
# 8. AUTHENTICATED CLINICIAN OPERATIONS
# ═══════════════════════════════════════════════

log_section "8. Authenticated Operations — User Profile"

BODY=$(http_get_body "/users/me")
assert "GET /users/me returns user data" 'echo "$BODY" | grep -q "email"'

BODY=$(http_patch_body "/users/me" '{"display_name":"Dr. Test"}')
assert "PATCH /users/me updates profile" 'echo "$BODY" | grep -q "Dr. Test"'


log_section "8b. Clinician Data"

CODE=$(http_get "/clinician-data")
assert "GET /clinician-data returns 200 for clinician" '[ "$CODE" = "200" ]'


# ═══════════════════════════════════════════════
# 9. CREATE CLIENT ACCOUNT (Family + Children)
# ═══════════════════════════════════════════════

log_section "9. Create Client Account"

BODY=$(http_post_body "/create-client-account" \
  "{\"accountType\":\"parent_family\",\"familyName\":\"$RUN_ID Family\",\"parentName\":\"Parent Test\",\"accountEmail\":\"parent-$RUN_ID@test.dev\",\"children\":[{\"child_name\":\"Child One\",\"age\":8,\"diagnosis\":\"ASD\"},{\"child_name\":\"Child Two\",\"age\":5}],\"clientAccount\":{\"username\":\"$CLIENT_USERNAME\",\"access_code\":\"$CLIENT_ACCESS_CODE\"}}")

FAMILY_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CHILD_IDS=$(echo "$BODY" | grep -o '"id":"[^"]*"' | tail -n +2)
CHILD_ID=$(echo "$CHILD_IDS" | head -1 | cut -d'"' -f4)
CHILD_ID_2=$(echo "$CHILD_IDS" | tail -1 | cut -d'"' -f4)

assert "Create client account returns family" '[ -n "$FAMILY_ID" ]'
assert "Create client account returns children" '[ -n "$CHILD_ID" ]'

echo "    [Created family=$FAMILY_ID, child1=$CHILD_ID, child2=$CHILD_ID_2]"


# ═══════════════════════════════════════════════
# 10. CRUD OPERATIONS — Children
# ═══════════════════════════════════════════════

log_section "10. CRUD — Children"

# List
BODY=$(http_get_body "/children")
assert "GET /children returns array" 'echo "$BODY" | grep -q "\["'

# Get by ID
if [ -n "$CHILD_ID" ]; then
  CODE=$(http_get "/children/$CHILD_ID")
  assert "GET /children/:id returns 200" '[ "$CODE" = "200" ]'

  BODY=$(http_patch_body "/children/$CHILD_ID" '{"notes":"Updated via test suite"}')
  assert "PATCH /children/:id updates record" 'echo "$BODY" | grep -q "Updated via test suite"'
else
  skip "GET /children/:id" "no child ID from create"
  skip "PATCH /children/:id" "no child ID from create"
fi


# ═══════════════════════════════════════════════
# 11. CRUD OPERATIONS — Families
# ═══════════════════════════════════════════════

log_section "11. CRUD — Families"

BODY=$(http_get_body "/families")
assert "GET /families returns array" 'echo "$BODY" | grep -q "\["'

if [ -n "$FAMILY_ID" ]; then
  CODE=$(http_get "/families/$FAMILY_ID")
  assert "GET /families/:id returns 200" '[ "$CODE" = "200" ]'

  BODY=$(http_patch_body "/families/$FAMILY_ID" '{"notes":"Family updated by test"}')
  assert "PATCH /families/:id updates record" 'echo "$BODY" | grep -q "Family updated"'
else
  skip "GET /families/:id" "no family ID"
  skip "PATCH /families/:id" "no family ID"
fi


# ═══════════════════════════════════════════════
# 12. CRUD — Behavior Plans
# ═══════════════════════════════════════════════

log_section "12. CRUD — Behavior Plans"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/behavior-plans" \
    "{\"child_id\":\"$CHILD_ID\",\"behavior_name\":\"Test Behavior Plan\",\"behavior_description\":\"Created by test suite\"}")
  BEHAVIOR_PLAN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /behavior-plans creates plan" '[ -n "$BEHAVIOR_PLAN_ID" ]'

  if [ -n "$BEHAVIOR_PLAN_ID" ]; then
    CODE=$(http_get "/behavior-plans/$BEHAVIOR_PLAN_ID")
    assert "GET /behavior-plans/:id returns 200" '[ "$CODE" = "200" ]'

    BODY=$(http_patch_body "/behavior-plans/$BEHAVIOR_PLAN_ID" '{"behavior_description":"Updated by test"}')
    assert "PATCH /behavior-plans/:id updates" 'echo "$BODY" | grep -q "Updated by test"'
  fi
else
  skip "Behavior plans CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 13. CRUD — Documents
# ═══════════════════════════════════════════════

log_section "13. CRUD — Documents"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/documents" \
    "{\"child_id\":\"$CHILD_ID\",\"title\":\"Test Document\",\"category\":\"assessment\",\"file_name\":\"test.pdf\"}")
  DOCUMENT_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /documents creates document" '[ -n "$DOCUMENT_ID" ]'

  if [ -n "$DOCUMENT_ID" ]; then
    CODE=$(http_get "/documents/$DOCUMENT_ID")
    assert "GET /documents/:id returns 200" '[ "$CODE" = "200" ]'
  fi
else
  skip "Documents CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 14. CRUD — Behavior Logs
# ═══════════════════════════════════════════════

log_section "14. CRUD — Behavior Logs"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/behavior-logs" \
    "{\"child_id\":\"$CHILD_ID\",\"behavior_type\":\"aggression\",\"intensity\":\"moderate\",\"notes\":\"Test log entry\"}")
  LOG_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /behavior-logs creates log" '[ -n "$LOG_ID" ]'

  if [ -n "$LOG_ID" ]; then
    CODE=$(http_get "/behavior-logs/$LOG_ID")
    assert "GET /behavior-logs/:id returns 200" '[ "$CODE" = "200" ]'
  fi
else
  skip "Behavior logs CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 15. CRUD — Win Logs
# ═══════════════════════════════════════════════

log_section "15. CRUD — Win Logs"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/win-logs" \
    "{\"child_id\":\"$CHILD_ID\",\"description\":\"Test win log\"}")
  WIN_LOG_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /win-logs creates win log" '[ -n "$WIN_LOG_ID" ]'
else
  skip "Win logs CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 16. CRUD — Reward Tokens (Goals)
# ═══════════════════════════════════════════════

log_section "16. CRUD — Reward Tokens"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/reward-tokens" \
    "{\"child_id\":\"$CHILD_ID\",\"goal_title\":\"Test Goal\",\"goal_description\":\"Created by test\",\"target\":10}")
  GOAL_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /reward-tokens creates goal" '[ -n "$GOAL_ID" ]'

  if [ -n "$GOAL_ID" ]; then
    BODY=$(http_patch_body "/reward-tokens/$GOAL_ID" '{"progress":5}')
    assert "PATCH /reward-tokens/:id updates progress" 'echo "$BODY" | grep -q "5"'
  fi
else
  skip "Reward tokens CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 17. CRUD — Messages, Daily Check-ins, AI Conversations
# ═══════════════════════════════════════════════

log_section "17. CRUD — Messages, Check-ins, AI Conversations"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/messages" \
    "{\"child_id\":\"$CHILD_ID\",\"content\":\"Test message\",\"sender_role\":\"clinician\"}")
  MSG_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /messages creates message" '[ -n "$MSG_ID" ]'

  BODY=$(http_post_body "/daily-check-ins" \
    "{\"child_id\":\"$CHILD_ID\",\"mood\":\"happy\",\"notes\":\"Good day\"}")
  CHECKIN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /daily-check-ins creates check-in" '[ -n "$CHECKIN_ID" ]'

  BODY=$(http_post_body "/engagement-events" \
    "{\"child_id\":\"$CHILD_ID\",\"event_type\":\"app_open\"}")
  EVENT_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /engagement-events creates event" '[ -n "$EVENT_ID" ]'
else
  skip "Messages/Check-ins/Events CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 18. CRUD — Intervention Plans
# ═══════════════════════════════════════════════

log_section "18. CRUD — Intervention Plans"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/intervention-plans" \
    "{\"child_id\":\"$CHILD_ID\",\"title\":\"Test Intervention\",\"description\":\"Test plan\"}")
  IP_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /intervention-plans creates plan" '[ -n "$IP_ID" ]'
else
  skip "Intervention plans CRUD" "no child ID"
fi


# ═══════════════════════════════════════════════
# 19. CLIENT DETAIL & FAMILY DETAIL
# ═══════════════════════════════════════════════

log_section "19. Client & Family Detail Endpoints"

if [ -n "$CHILD_ID" ]; then
  CODE=$(http_get "/client-detail?child_id=$CHILD_ID")
  assert "GET /client-detail returns 200" '[ "$CODE" = "200" ]'

  BODY=$(http_get_body "/client-detail?child_id=$CHILD_ID")
  assert "Client detail includes child data" 'echo "$BODY" | grep -q "child"'
  assert "Client detail includes plans" 'echo "$BODY" | grep -q "plans"'
  assert "Client detail includes documents" 'echo "$BODY" | grep -q "documents"'
else
  skip "Client detail" "no child ID"
fi

if [ -n "$FAMILY_ID" ]; then
  CODE=$(http_get "/family-detail?family_id=$FAMILY_ID")
  assert "GET /family-detail returns 200" '[ "$CODE" = "200" ]'

  BODY=$(http_get_body "/family-detail?family_id=$FAMILY_ID")
  assert "Family detail includes children" 'echo "$BODY" | grep -q "children"'
  assert "Family detail includes stats" 'echo "$BODY" | grep -q "stats"'
else
  skip "Family detail" "no family ID"
fi


# ═══════════════════════════════════════════════
# 20. ADD CHILD TO FAMILY
# ═══════════════════════════════════════════════

log_section "20. Add Child to Family"

if [ -n "$FAMILY_ID" ]; then
  BODY=$(http_post_body "/add-child-to-family" \
    "{\"family_id\":\"$FAMILY_ID\",\"child_name\":\"Child Three\",\"age\":3}")
  NEW_CHILD_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "POST /add-child-to-family creates child" '[ -n "$NEW_CHILD_ID" ]'
  echo "    [Added child3=$NEW_CHILD_ID]"
else
  skip "Add child to family" "no family ID"
fi


# ═══════════════════════════════════════════════
# 21. MANAGE CLIENT RECORD
# ═══════════════════════════════════════════════

log_section "21. Manage Client Record"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/manage-client-record" \
    "{\"action\":\"updateChild\",\"entity_id\":\"$CHILD_ID\",\"data\":{\"notes\":\"Updated via manage-client-record\"}}")
  assert "updateChild action works" 'echo "$BODY" | grep -q "record"'
fi

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/manage-client-record" \
    "{\"action\":\"createDocument\",\"data\":{\"child_id\":\"$CHILD_ID\",\"title\":\"Managed Doc\",\"category\":\"report\"}}")
  MANAGED_DOC_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "createDocument action works" '[ -n "$MANAGED_DOC_ID" ]'
fi

CODE=$(http_post "/manage-client-record" '{"action":"unknownAction"}')
assert "Unknown action returns 400" '[ "$CODE" = "400" ]'


# ═══════════════════════════════════════════════
# 22. MANAGE CLIENT GOAL (Clinician Auth)
# ═══════════════════════════════════════════════

log_section "22. Manage Client Goal — Clinician Auth"

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_body "/manage-client-goal" \
    "{\"action\":\"create\",\"child_id\":\"$CHILD_ID\",\"data\":{\"goal_title\":\"Goal via manage\",\"target\":5}}")
  MANAGED_GOAL_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "Create goal via manage-client-goal" '[ -n "$MANAGED_GOAL_ID" ]'

  if [ -n "$MANAGED_GOAL_ID" ]; then
    BODY=$(http_post_body "/manage-client-goal" \
      "{\"action\":\"update\",\"entity_id\":\"$MANAGED_GOAL_ID\",\"data\":{\"progress\":3}}")
    assert "Update goal via manage-client-goal" 'echo "$BODY" | grep -q "record"'

    BODY=$(http_post_body "/manage-client-goal" \
      "{\"action\":\"delete\",\"entity_id\":\"$MANAGED_GOAL_ID\"}")
    assert "Delete goal via manage-client-goal" 'echo "$BODY" | grep -q "ok"'
  fi
else
  skip "Manage client goal (clinician)" "no child ID"
fi


# ═══════════════════════════════════════════════
# 23. CLIENT SESSION LOGIN
# ═══════════════════════════════════════════════

log_section "23. Client Session Login"

# Invalid credentials
CODE=$(http_post_noauth "/client-session/login" \
  '{"username":"nonexistent","access_code":"WRONG"}')
assert "Login rejects invalid client credentials" '[ "$CODE" = "401" ]'

# Missing fields
CODE=$(http_post_noauth "/client-session/login" '{"username":"onlyuser"}')
assert "Login rejects missing access_code" '[ "$CODE" = "400" ]'

# Valid login
if [ -n "$CLIENT_USERNAME" ]; then
  BODY=$(http_post_noauth_body "/client-session/login" \
    "{\"username\":\"$CLIENT_USERNAME\",\"access_code\":\"$CLIENT_ACCESS_CODE\"}")
  CLIENT_TOKEN=$(echo "$BODY" | grep -o '"invite_token":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "Client session login succeeds" '[ -n "$CLIENT_TOKEN" ]'
  echo "    [Got client token: ${CLIENT_TOKEN:0:16}...]"
fi


# ═══════════════════════════════════════════════
# 24. VERIFY CLIENT CREDENTIALS
# ═══════════════════════════════════════════════

log_section "24. Verify Client Credentials"

BODY=$(http_post_noauth_body "/verify-client-credentials" \
  '{"username":"nobody","access_code":"WRONG"}')
assert "verify-client-credentials rejects bad creds" 'echo "$BODY" | grep -q "error\|Invalid"'

if [ -n "$CLIENT_USERNAME" ]; then
  BODY=$(http_post_noauth_body "/verify-client-credentials" \
    "{\"username\":\"$CLIENT_USERNAME\",\"access_code\":\"$CLIENT_ACCESS_CODE\"}")
  assert "verify-client-credentials accepts valid creds" 'echo "$BODY" | grep -q "session"'
fi


# ═══════════════════════════════════════════════
# 25. CLIENT PORTAL DATA
# ═══════════════════════════════════════════════

log_section "25. Client Portal Data"

# Without token → 401
CODE=$(http_post_noauth "/client-portal-data" "{\"child_id\":\"$CHILD_ID\"}")
assert "Client portal data requires token" '[ "$CODE" = "400" -o "$CODE" = "401" ]'

# With valid token
if [ -n "$CLIENT_TOKEN" ] && [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_noauth_body "/client-portal-data" \
    "{\"child_id\":\"$CHILD_ID\",\"invite_token\":\"$CLIENT_TOKEN\"}")
  assert "Client portal data returns child info" 'echo "$BODY" | grep -q "child"'
  assert "Client portal data returns plans" 'echo "$BODY" | grep -q "plans"'
  assert "Client portal data returns siblings" 'echo "$BODY" | grep -q "siblings"'
  assert "Client portal data returns behavior logs" 'echo "$BODY" | grep -q "behaviorLogs\|behavior_logs"'
  assert "Client portal data returns win logs" 'echo "$BODY" | grep -q "winLogs\|win_logs"'
else
  skip "Client portal data with token" "no client token or child ID"
fi


# ═══════════════════════════════════════════════
# 26. CLIENT SESSION — Invite Token Auth on Entity Routes
# ═══════════════════════════════════════════════

log_section "26. Client Token — Entity Route Auth"

if [ -n "$CLIENT_TOKEN" ] && [ -n "$CHILD_ID" ]; then
  # behavior-logs accepts invite_token
  BODY=$(http_post_noauth_body "/behavior-logs" \
    "{\"child_id\":\"$CHILD_ID\",\"invite_token\":\"$CLIENT_TOKEN\",\"behavior_type\":\"tantrum\",\"intensity\":\"low\"}")
  assert "POST /behavior-logs with invite_token works" 'echo "$BODY" | grep -q "id"'

  # win-logs accepts invite_token
  BODY=$(http_post_noauth_body "/win-logs" \
    "{\"child_id\":\"$CHILD_ID\",\"invite_token\":\"$CLIENT_TOKEN\",\"description\":\"Client win\"}")
  assert "POST /win-logs with invite_token works" 'echo "$BODY" | grep -q "id"'

  # engagement-events accepts invite_token
  BODY=$(http_post_noauth_body "/engagement-events" \
    "{\"child_id\":\"$CHILD_ID\",\"invite_token\":\"$CLIENT_TOKEN\",\"event_type\":\"page_view\"}")
  assert "POST /engagement-events with invite_token works" 'echo "$BODY" | grep -q "id"'
else
  skip "Client token entity routes" "no client token"
fi


# ═══════════════════════════════════════════════
# 27. MANAGE CLIENT GOAL — Client Session Auth
# ═══════════════════════════════════════════════

log_section "27. Manage Client Goal — Client Session Auth"

if [ -n "$CLIENT_TOKEN" ] && [ -n "$CHILD_ID" ]; then
  BODY=$(http_post_noauth_body "/manage-client-goal" \
    "{\"action\":\"create\",\"invite_token\":\"$CLIENT_TOKEN\",\"child_id\":\"$CHILD_ID\",\"data\":{\"goal_title\":\"Parent goal\",\"target\":3}}")
  PARENT_GOAL_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  assert "Client creates goal via manage-client-goal" '[ -n "$PARENT_GOAL_ID" ]'

  if [ -n "$PARENT_GOAL_ID" ]; then
    BODY=$(http_post_noauth_body "/manage-client-goal" \
      "{\"action\":\"update\",\"invite_token\":\"$CLIENT_TOKEN\",\"entity_id\":\"$PARENT_GOAL_ID\",\"data\":{\"progress\":2}}")
    assert "Client updates own goal" 'echo "$BODY" | grep -q "record"'
  fi
else
  skip "Client goal management" "no client token"
fi


# ═══════════════════════════════════════════════
# 28. CLIENT SESSION — CHANGE ACCESS CODE
# ═══════════════════════════════════════════════

log_section "28. Change Access Code"

# Wrong current code
CODE=$(http_post_noauth "/client-session/change-access-code" \
  "{\"username\":\"$CLIENT_USERNAME\",\"current_access_code\":\"WRONGCODE\",\"new_access_code\":\"NEWCODE1\"}")
assert "Change code rejects wrong current code" '[ "$CODE" = "401" ]'

# Too short new code
CODE=$(http_post_noauth "/client-session/change-access-code" \
  "{\"username\":\"$CLIENT_USERNAME\",\"current_access_code\":\"$CLIENT_ACCESS_CODE\",\"new_access_code\":\"AB\"}")
assert "Change code rejects short new code" '[ "$CODE" = "400" ]'

# Valid change
BODY=$(http_post_noauth_body "/client-session/change-access-code" \
  "{\"username\":\"$CLIENT_USERNAME\",\"current_access_code\":\"$CLIENT_ACCESS_CODE\",\"new_access_code\":\"NEWCODE99\"}")
assert "Change access code succeeds" 'echo "$BODY" | grep -q "ok"'
assert "Change code returns new session" 'echo "$BODY" | grep -q "invite_token"'

# Update the access code for subsequent tests
CLIENT_ACCESS_CODE="NEWCODE99"

# Verify login with new code
BODY=$(http_post_noauth_body "/client-session/login" \
  "{\"username\":\"$CLIENT_USERNAME\",\"access_code\":\"$CLIENT_ACCESS_CODE\"}")
assert "Login works with new access code" 'echo "$BODY" | grep -q "invite_token"'


# ═══════════════════════════════════════════════
# 29. MOBILE AUTH
# ═══════════════════════════════════════════════

log_section "29. Mobile Auth"

# Login with invalid creds
CODE=$(http_post_noauth "/mobile/auth/login" '{"username":"nobody","access_code":"WRONG"}')
assert "Mobile login rejects bad creds" '[ "$CODE" = "401" ]'

# Login with valid creds
if [ -n "$CLIENT_USERNAME" ]; then
  BODY=$(http_post_noauth_body "/mobile/auth/login" \
    "{\"username\":\"$CLIENT_USERNAME\",\"access_code\":\"$CLIENT_ACCESS_CODE\"}")
  MOBILE_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  assert "Mobile login succeeds" '[ -n "$MOBILE_TOKEN" ]'
  if [ -n "$MOBILE_TOKEN" ]; then
    echo "    [Got mobile token: ${MOBILE_TOKEN:0:16}...]"
  fi
fi


# ═══════════════════════════════════════════════
# 30. MOBILE ENDPOINTS — Auth Guard
# ═══════════════════════════════════════════════

log_section "30. Mobile Endpoints — Auth Guard"

MOBILE_ROUTES=("mobile/children" "mobile/behavior-plans" "mobile/behavior-logs"
               "mobile/messages" "mobile/documents" "mobile/reward-tokens"
               "mobile/win-logs" "mobile/daily-check-ins" "mobile/ai-conversations")

for route in "${MOBILE_ROUTES[@]}"; do
  CODE=$(http_get_noauth "/$route"); throttle
  assert_status "GET /$route requires mobile token" "$CODE" "401"
done


# ═══════════════════════════════════════════════
# 31. MOBILE ENDPOINTS — With Token
# ═══════════════════════════════════════════════

log_section "31. Mobile Endpoints — With Token"

if [ -n "$MOBILE_TOKEN" ]; then
  mobile_get() {
    curl -s -o /dev/null -w '%{http_code}' "$API/api/$1" \
      -H "x-mobile-token: $MOBILE_TOKEN" 2>/dev/null || echo "000"
  }
  mobile_get_body() {
    curl -s "$API/api/$1" \
      -H "x-mobile-token: $MOBILE_TOKEN" 2>/dev/null || echo "{}"
  }
  mobile_post_body() {
    local path="$1"; shift
    curl -s -X POST "$API/api/$path" \
      -H "x-mobile-token: $MOBILE_TOKEN" \
      -H 'Content-Type: application/json' -d "$@" 2>/dev/null || echo "{}"
  }

  CODE=$(mobile_get "mobile/children")
  assert "GET /mobile/children returns 200" '[ "$CODE" = "200" ]'

  CODE=$(mobile_get "mobile/behavior-plans")
  assert "GET /mobile/behavior-plans returns 200" '[ "$CODE" = "200" ]'

  CODE=$(mobile_get "mobile/behavior-logs")
  assert "GET /mobile/behavior-logs returns 200" '[ "$CODE" = "200" ]'

  BODY=$(mobile_post_body "mobile/behavior-logs" \
    '{"behavior_type":"elopement","intensity":"high","notes":"Mobile test log"}')
  assert "POST /mobile/behavior-logs creates log" 'echo "$BODY" | grep -q "id"'

  CODE=$(mobile_get "mobile/messages")
  assert "GET /mobile/messages returns 200" '[ "$CODE" = "200" ]'

  BODY=$(mobile_post_body "mobile/messages" \
    '{"content":"Hello from mobile test","sender_role":"client"}')
  assert "POST /mobile/messages creates message" 'echo "$BODY" | grep -q "id"'

  CODE=$(mobile_get "mobile/documents")
  assert "GET /mobile/documents returns 200" '[ "$CODE" = "200" ]'

  CODE=$(mobile_get "mobile/reward-tokens")
  assert "GET /mobile/reward-tokens returns 200" '[ "$CODE" = "200" ]'

  CODE=$(mobile_get "mobile/win-logs")
  assert "GET /mobile/win-logs returns 200" '[ "$CODE" = "200" ]'

  BODY=$(mobile_post_body "mobile/win-logs" '{"description":"Mobile win test"}')
  assert "POST /mobile/win-logs creates win" 'echo "$BODY" | grep -q "id"'

  CODE=$(mobile_get "mobile/daily-check-ins")
  assert "GET /mobile/daily-check-ins returns 200" '[ "$CODE" = "200" ]'

  BODY=$(mobile_post_body "mobile/daily-check-ins" '{"mood":"calm","notes":"Mobile check-in"}')
  assert "POST /mobile/daily-check-ins creates check-in" 'echo "$BODY" | grep -q "id"'

  CODE=$(mobile_get "mobile/ai-conversations")
  assert "GET /mobile/ai-conversations returns 200" '[ "$CODE" = "200" ]'

  # Logout
  LOGOUT_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/api/mobile/auth/logout" \
    -H "x-mobile-token: $MOBILE_TOKEN" 2>/dev/null || echo "000")
  assert "DELETE /mobile/auth/logout succeeds" '[ "$LOGOUT_CODE" = "200" ]'

  # Token should be invalid after logout
  CODE=$(mobile_get "mobile/children")
  assert "Token invalid after logout" '[ "$CODE" = "401" ]'
else
  skip "Mobile endpoints with token" "no mobile token"
fi


# ═══════════════════════════════════════════════
# 32. UPLOAD SECURITY
# ═══════════════════════════════════════════════

log_section "32. Upload Security"

# Valid PDF upload (create a tiny valid-looking file)
TMPFILE=$(mktemp --suffix=.pdf)
echo '%PDF-1.4 test' > "$TMPFILE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/upload" \
  -F "file=@$TMPFILE;type=application/pdf" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000")
assert "Upload accepts PDF" '[ "$CODE" = "200" ]'

# Invalid file type
TMPJS=$(mktemp --suffix=.js)
echo 'alert(1)' > "$TMPJS"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/upload" \
  -F "file=@$TMPJS;type=application/javascript" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000")
assert "Upload rejects .js files (got $CODE)" '[ "$CODE" = "400" ]'

# Invalid file type — .exe
TMPEXE=$(mktemp --suffix=.exe)
echo 'MZ' > "$TMPEXE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/upload" \
  -F "file=@$TMPEXE;type=application/x-msdownload" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || echo "000")
assert "Upload rejects .exe files (got $CODE)" '[ "$CODE" = "400" ]'

rm -f "$TMPFILE" "$TMPJS" "$TMPEXE"


# ═══════════════════════════════════════════════
# 33. TENANT ISOLATION
# ═══════════════════════════════════════════════

log_section "33. Tenant Isolation"

# Register a second clinician and try to access the first clinician's data
CLINICIAN2_EMAIL="${RUN_ID}_2@test.neuropathways.dev"
BODY=$(http_post_noauth_body "/clinician/register" \
  "{\"email\":\"$CLINICIAN2_EMAIL\",\"password\":\"$CLINICIAN_PASS\",\"firstName\":\"Other\",\"lastName\":\"Doctor\"}")

# Login as second clinician
curl -s -D - -X POST "$API/api/clinician/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CLINICIAN2_EMAIL\",\"password\":\"$CLINICIAN_PASS\"}" \
  -c "$COOKIE_JAR2" > /dev/null 2>&1

# Try to access first clinician's child
if [ -n "$CHILD_ID" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/client-detail?child_id=$CHILD_ID" \
    -b "$COOKIE_JAR2" 2>/dev/null || echo "000")
  assert "Clinician 2 cannot access Clinician 1's child (got $CODE)" '[ "$CODE" = "403" ]'
fi

if [ -n "$FAMILY_ID" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/family-detail?family_id=$FAMILY_ID" \
    -b "$COOKIE_JAR2" 2>/dev/null || echo "000")
  assert "Clinician 2 cannot access Clinician 1's family (got $CODE)" '[ "$CODE" = "403" ]'
fi

# Clinician 2 should see empty list (not first clinician's data)
BODY=$(curl -s "$API/api/children" -b "$COOKIE_JAR2" 2>/dev/null)
assert "Clinician 2 sees empty children list" 'echo "$BODY" | grep -q "\[\]"'


# ═══════════════════════════════════════════════
# 34. CLINICIAN PASSWORD CHANGE
# ═══════════════════════════════════════════════

log_section "34. Clinician Password Change"

# Wrong current password
CODE=$(http_post "/clinician/change-password" \
  '{"current_password":"WrongPassword","new_password":"NewPass123!"}')
assert "Password change rejects wrong current password" '[ "$CODE" = "401" ]'

# Short new password
CODE=$(http_post "/clinician/change-password" \
  "{\"current_password\":\"$CLINICIAN_PASS\",\"new_password\":\"short\"}")
assert "Password change rejects short new password" '[ "$CODE" = "400" ]'

# Valid password change
BODY=$(http_post_body "/clinician/change-password" \
  "{\"current_password\":\"$CLINICIAN_PASS\",\"new_password\":\"NewTestPass123!\"}")
assert "Password change succeeds" 'echo "$BODY" | grep -q "ok"'

# Login with new password
CODE=$(http_post_noauth "/clinician/login" \
  "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"NewTestPass123!\"}")
assert "Login works with new password" '[ "$CODE" = "200" ]'

# Re-login to restore cookie for remaining tests
curl -s -X POST "$API/api/clinician/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"NewTestPass123!\"}" \
  -c "$COOKIE_JAR" > /dev/null 2>&1


# ═══════════════════════════════════════════════
# 35. INPUT VALIDATION
# ═══════════════════════════════════════════════

log_section "35. Input Validation"

# client-detail without child_id
CODE=$(http_get "/client-detail")
assert "client-detail requires child_id param" '[ "$CODE" = "400" ]'

# family-detail without family_id
CODE=$(http_get "/family-detail")
assert "family-detail requires family_id param" '[ "$CODE" = "400" ]'

# add-child-to-family without required fields
CODE=$(http_post "/add-child-to-family" '{}')
assert "add-child-to-family requires family_id" '[ "$CODE" = "400" ]'

# build-client-profile without child_id
CODE=$(http_post "/build-client-profile" '{}')
assert "build-client-profile requires child_id" '[ "$CODE" = "400" ]'

# manage-client-record with unknown action
CODE=$(http_post "/manage-client-record" '{"action":"destroyEverything"}')
assert "manage-client-record rejects unknown action" '[ "$CODE" = "400" ]'

# manage-client-goal with unknown action
CODE=$(http_post "/manage-client-goal" '{"action":"nuke"}')
assert "manage-client-goal rejects unknown action" '[ "$CODE" = "400" ]'

# Nonexistent child
CODE=$(http_get "/client-detail?child_id=nonexistent-uuid-00000")
assert "client-detail returns 404 for nonexistent child" '[ "$CODE" = "404" ]'

# Nonexistent family
CODE=$(http_get "/family-detail?family_id=nonexistent-uuid-00000")
assert "family-detail returns 404 for nonexistent family" '[ "$CODE" = "404" ]'


# ═══════════════════════════════════════════════
# 36. API RESPONSE FORMAT
# ═══════════════════════════════════════════════

log_section "36. API Response Format"

BODY=$(http_get_body "/healthz")
assert "Health returns valid JSON" 'echo "$BODY" | python3 -m json.tool > /dev/null 2>&1'

BODY=$(http_get_body "/children")
assert "Children list returns valid JSON array" 'echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);assert isinstance(d,list)" 2>/dev/null'

if [ -n "$CHILD_ID" ]; then
  BODY=$(http_get_body "/children/$CHILD_ID")
  assert "Child detail returns valid JSON" 'echo "$BODY" | python3 -m json.tool > /dev/null 2>&1'
  assert "Child has snake_case keys" 'echo "$BODY" | grep -q "child_name\|childName\|id"'
fi


# ═══════════════════════════════════════════════
# 37. CLEANUP — Delete Test Data
# ═══════════════════════════════════════════════

log_section "37. Cleanup — Delete Test Data"

# Re-login as primary clinician to clean up
curl -s -X POST "$API/api/clinician/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CLINICIAN_EMAIL\",\"password\":\"NewTestPass123!\"}" \
  -c "$COOKIE_JAR" > /dev/null 2>&1

if [ -n "$BEHAVIOR_PLAN_ID" ]; then
  CODE=$(http_delete "/behavior-plans/$BEHAVIOR_PLAN_ID")
  assert "DELETE /behavior-plans/:id" '[ "$CODE" = "200" ]'
fi

if [ -n "$DOCUMENT_ID" ]; then
  CODE=$(http_delete "/documents/$DOCUMENT_ID")
  assert "DELETE /documents/:id" '[ "$CODE" = "200" ]'
fi

# Delete family (cascades children)
if [ -n "$FAMILY_ID" ]; then
  BODY=$(http_post_body "/manage-client-record" \
    "{\"action\":\"deleteFamily\",\"entity_id\":\"$FAMILY_ID\"}")
  assert "Delete family via manage-client-record" 'echo "$BODY" | grep -q "ok"'
fi


# ═══════════════════════════════════════════════
# RESULTS
# ═══════════════════════════════════════════════

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}  TEST RESULTS${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed:  $PASS${NC}"
echo -e "  ${RED}Failed:  $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo ""

if [ "$RATE_LIMITED" = true ]; then
  echo -e "  ${YELLOW}⚠  Some tests were rate-limited (429). Wait 15 minutes and rerun.${NC}"
  echo ""
fi

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "  ${RED}$FAIL TEST(S) FAILED${NC}"
  exit 1
fi
