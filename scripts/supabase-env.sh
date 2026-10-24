#!/usr/bin/env bash
# Writes the local Supabase connection values to .env.test for tests and local E2E.
set -euo pipefail
cd "$(dirname "$0")/.."
status="$(pnpm exec supabase status -o env 2>/dev/null)"
get() { printf '%s\n' "$status" | grep "^$1=" | head -1 | cut -d= -f2- | tr -d '"'; }
# Keep local secrets stable across runs, so sealed rows in the local database stay readable.
keep() { { [ -f .env.test ] && grep "^$1=" .env.test | head -1 | cut -d= -f2-; } || true; }
mask_key="$(keep MASK_MAP_KEY)"; mask_key="${mask_key:-$(openssl rand -base64 32)}"
agent_token="$(keep AGENT_API_TOKEN)"; agent_token="${agent_token:-$(openssl rand -hex 32)}"
{
  echo "SUPABASE_URL=$(get API_URL)"
  echo "SUPABASE_ANON_KEY=$(get ANON_KEY)"
  echo "SUPABASE_SERVICE_ROLE_KEY=$(get SERVICE_ROLE_KEY)"
  echo "MAILPIT_URL=$(get INBUCKET_URL)"
  echo "MASK_MAP_KEY=$mask_key"
  echo "AGENT_API_TOKEN=$agent_token"
} > .env.test
echo "Wrote .env.test"
