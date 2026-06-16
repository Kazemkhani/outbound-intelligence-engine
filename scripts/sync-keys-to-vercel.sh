#!/usr/bin/env bash
# Push every provider key present in .env up to the Vercel project, WITHOUT ever
# printing a value or putting one in a command (values flow .env -> shell var ->
# the Python helper via the environment). Run: bash scripts/sync-keys-to-vercel.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENVFILE=".env"
[ -f "$ENVFILE" ] || { echo "no .env found"; exit 1; }

KEYS="ANTHROPIC_API_KEY CLAY_WEBHOOK_URL CLAY_API_KEY EXPLORIUM_API_KEY APOLLO_API_KEY \
GOOGLE_MAPS_API_KEY THEIRSTACK_API_KEY BUILTWITH_API_KEY PREDICTLEADS_API_KEY \
PREDICTLEADS_API_TOKEN EXA_API_KEY SMARTLEAD_API_KEY RESEND_API_KEY UNIPILE_API_KEY \
UNIPILE_DSN HUBSPOT_ACCESS_TOKEN COMPOSIO_API_KEY SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN"

set_count=0
for K in $KEYS; do
  V=$(grep "^${K}=" "$ENVFILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
  if [ -n "${V:-}" ]; then
    OIE_KEY_NAME="$K" OIE_KEY_VALUE="$V" python3 scripts/_set_vercel_env.py >/dev/null && {
      echo "  pushed $K"
      set_count=$((set_count + 1))
    }
  fi
done
echo "Done — $set_count key(s) synced to Vercel (values never printed)."
echo "Redeploy with a push, or 'vercel redeploy', to pick them up."
