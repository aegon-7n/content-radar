#!/usr/bin/env bash
# S13 — Unauth API guard smoke tests
# Verifies that protected /api/* routes return 401 when called without a session,
# and that allowlisted public routes remain accessible.
#
# Usage: BASE_URL=https://app.contentradar.app ./api-smoke.sh
#        BASE_URL=http://localhost:3000 ./api-smoke.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ERRORS=()

check() {
  local id="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  local description="$5"

  actual_status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
    --cookie "" \
    --header "Accept: application/json" \
    "${BASE_URL}${path}")

  # Allow multiple acceptable statuses separated by |
  if echo "$actual_status" | grep -qE "^(${expected_status})$"; then
    echo "  PASS [$id] $description (HTTP $actual_status)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL [$id] $description — expected ${expected_status}, got $actual_status"
    ERRORS+=("[$id] $description: expected ${expected_status}, got $actual_status")
    FAIL=$((FAIL + 1))
  fi
}

echo "=== S13 Unauth API Guard — ${BASE_URL} ==="
echo ""
echo "--- Protected endpoints (must return 401) ---"

check "S13-A" GET "/api/dashboard"          "401" "GET /api/dashboard без сессии → 401"
check "S13-B" GET "/api/products"           "401" "GET /api/products без сессии → 401"
check "S13-C" GET "/api/creators"           "401" "GET /api/creators без сессии → 401"
check "S13-D" GET "/api/videos"             "401" "GET /api/videos без сессии → 401"
check "S13-E" GET "/api/settings/creators"  "401" "GET /api/settings/creators без сессии → 401"
check "S13-F" GET "/api/settings/products"  "401" "GET /api/settings/products без сессии → 401"
check "S13-G" GET "/api/videos/export"      "401" "GET /api/videos/export без сессии → 401"
check "S13-H" GET "/api/last-sync"          "401" "GET /api/last-sync без сессии → 401"

echo ""
echo "--- Public allowlist endpoints (must NOT return 401) ---"

check "S13-I" GET  "/api/ping"      "200"     "GET /api/ping без сессии → 200 (публичный liveness probe)"
# /api/health is intentionally auth-gated (TRU-171/TRU-288). Use /api/ping for uptime monitors.
# S13-J: /api/waitlist is in the middleware allowlist (public path).
# The route only exports POST handler → GET returns 405 from Next.js,
# proving the middleware let the request through (a 401 here would mean middleware blocked it).
# POST without WAITLIST_INGEST_SECRET returns route-level 401 — that is intentional
# bearer-token protection, NOT the NextAuth middleware. Smoke verifies middleware only.
check "S13-J" GET  "/api/waitlist"  "405" "GET /api/waitlist без сессии → 405 (middleware пропустил, Next.js вернул method not allowed)"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "Errors:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
  exit 1
fi

echo "All S13 checks passed."
exit 0
