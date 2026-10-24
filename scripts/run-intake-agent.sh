#!/usr/bin/env bash
# Runs the Claude intake agent against production from this machine.
# Needs ANTHROPIC_API_KEY and AGENT_API_TOKEN in .env.deploy.local.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a && . ./.env.deploy.local && set +a
: "${ANTHROPIC_API_KEY:?Add ANTHROPIC_API_KEY to .env.deploy.local}"
: "${AGENT_API_TOKEN:?Add AGENT_API_TOKEN to .env.deploy.local}"
export BUILDWISE_URL="${BUILDWISE_URL:-https://getbuildwise.vercel.app}"
exec pnpm --filter @buildwise/intake-agent start
