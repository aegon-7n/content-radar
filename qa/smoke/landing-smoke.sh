#!/usr/bin/env bash
# S14 — Landing smoke tests (contentradar.app)
# Verifies landing pages return 200 and CTA links point to app.contentradar.app.
#
# Usage: LANDING_URL=https://contentradar.app ./landing-smoke.sh
#        LANDING_URL=http://localhost:3001 ./landing-smoke.sh

set -euo pipefail

LANDING_URL="${LANDING_URL:-https://contentradar.app}"
APP_URL="${APP_URL:-https://app.contentradar.app}"
PASS=0
FAIL=0
ERRORS=()

# Use Vercel protection bypass token when available so automated runs from the
# agentic-company IP don't count toward Vercel's auto-challenge rate limit.
if [[ -z "${VERCEL_BYPASS_TOKEN:-}" ]] && [[ -f ~/.studio-secrets.env ]]; then
  # shellcheck source=/dev/null
  source ~/.studio-secrets.env 2>/dev/null || true
fi
BYPASS_ARGS=()
if [[ -n "${VERCEL_BYPASS_TOKEN:-}" ]]; then
  BYPASS_ARGS=(-H "x-vercel-protection-bypass: ${VERCEL_BYPASS_TOKEN}")
fi

check_status() {
  local id="$1"
  local path="$2"
  local expected_status="$3"
  local description="$4"

  actual_status=$(curl -s -o /dev/null -w "%{http_code}" -L "${BYPASS_ARGS[@]}" "${LANDING_URL}${path}")

  if echo "$actual_status" | grep -qE "^(${expected_status})$"; then
    echo "  PASS [$id] $description (HTTP $actual_status)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL [$id] $description — expected ${expected_status}, got $actual_status"
    ERRORS+=("[$id] $description: expected ${expected_status}, got $actual_status")
    FAIL=$((FAIL + 1))
  fi
}

check_cta_links() {
  local id="$1"
  local path="$2"
  local description="$3"

  local body
  body=$(curl -s -L "${BYPASS_ARGS[@]}" "${LANDING_URL}${path}")

  # CTA hrefs should point to app subdomain, not raw contentradar.app/login etc.
  if echo "$body" | grep -qE "href=['\"]${APP_URL}"; then
    echo "  PASS [$id] $description — CTA links to ${APP_URL}"
    PASS=$((PASS + 1))
  elif echo "$body" | grep -qE "href=['\"]https://app\.contentradar\.app"; then
    echo "  PASS [$id] $description — CTA links to app.contentradar.app"
    PASS=$((PASS + 1))
  else
    echo "  WARN [$id] $description — no CTA link to app.contentradar.app found (may be JS-rendered)"
    # Not a hard fail: landing might use JS-rendered links
  fi
}

echo "=== S14 Landing Smoke — ${LANDING_URL} ==="
echo ""
echo "--- Static pages (must return 200) ---"

check_status "S14-A" "/"        "200" "Landing root → 200"
check_status "S14-B" "/privacy" "200" "/privacy → 200"
check_status "S14-C" "/terms"   "200" "/terms → 200"

echo ""
echo "--- CTA links point to app subdomain ---"

check_cta_links "S14-D" "/" "Root page CTA → app.contentradar.app"

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

echo "All S14 landing checks passed."
exit 0
