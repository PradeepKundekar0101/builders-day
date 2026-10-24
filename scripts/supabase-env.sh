#!/usr/bin/env bash
# Writes the local Supabase connection values to .env.test for tests and local E2E.
set -euo pipefail
cd "$(dirname "$0")/.."
status="$(pnpm exec supabase status -o env 2>/dev/null)"
get() { printf '%s\n' "$status" | grep "^$1=" | head -1 | cut -d= -f2- | tr -d '"'; }
{
  echo "SUPABASE_URL=$(get API_URL)"
  echo "SUPABASE_ANON_KEY=$(get ANON_KEY)"
  echo "SUPABASE_SERVICE_ROLE_KEY=$(get SERVICE_ROLE_KEY)"
  echo "MAILPIT_URL=$(get INBUCKET_URL)"
} > .env.test
echo "Wrote .env.test"
