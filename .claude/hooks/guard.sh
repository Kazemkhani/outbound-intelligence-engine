#!/usr/bin/env bash
# OIE safety guard — PreToolUse hook (addendum §2, brief §3.5).
# Hard rails that survive context compaction: they live in the hook, not the transcript.
#   1. Block any command that disables the DRY_RUN safety flag.
#   2. Block hand-editing of generated Prisma migrations.
#   3. Block writes to the real secrets file (.env) — provider secrets are human-placed.
# Exit 2 = deny (Claude sees stderr as feedback). Exit 0 = allow.

set -euo pipefail
payload="$(cat)"

# Extract fields without requiring jq (best-effort grep on the JSON payload).
tool="$(printf '%s' "$payload" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"

deny() {
  echo "OIE GUARD: $1" >&2
  exit 2
}

# 1. Never let DRY_RUN be flipped off from a shell command.
if printf '%s' "$payload" | grep -Eiq 'DRY_RUN[[:space:]]*=[[:space:]]*(false|0|no|off)'; then
  deny "refusing to disable DRY_RUN. Live send requires the human gate (§3.4)."
fi

# 2/3. Path-based guards for file-writing tools.
case "$tool" in
  Write|Edit|MultiEdit|NotebookEdit)
    path="$(printf '%s' "$payload" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    case "$path" in
      */prisma/migrations/*)
        deny "do not hand-edit generated migrations under prisma/migrations. Use prisma migrate." ;;
      */.env|*/.env.local|*/.env.production)
        deny "do not write real secrets files. Document keys in .env.example; the human places .env values." ;;
    esac
    ;;
esac

exit 0
