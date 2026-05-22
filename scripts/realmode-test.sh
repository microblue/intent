#!/usr/bin/env bash
# Run a real-mode Playwright spec against prod, with credentials loaded.
# Usage: ./scripts/realmode-test.sh e2e/walkthrough-foo.spec.ts [extra playwright args...]
# Reads creds from ~/.openclaw/credentials/myclaw-supabase.env — never echoes them.
set -euo pipefail

CRED_FILE="${HOME}/.openclaw/credentials/myclaw-supabase.env"
if [[ ! -f "${CRED_FILE}" ]]; then
  echo "missing creds at ${CRED_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${CRED_FILE}"
set +a

: "${PROD_URL:=https://app.myclaw.one}"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-${PROD_URL}}"
export REAL_TEST_EMAIL="${REAL_TEST_EMAIL:-microblue@gmail.com}"
export SUPABASE_PUB_KEY="${SUPABASE_PUB_KEY:-${SUPABASE_ANON_KEY:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SECRET_KEY:-}}"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_PUB_KEY:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "creds file missing required keys (SUPABASE_URL / SUPABASE_PUB_KEY / SUPABASE_SERVICE_ROLE_KEY)" >&2
  exit 1
fi

exec pnpm exec playwright test "$@"
