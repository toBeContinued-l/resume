#!/bin/sh

set -eu

PORT="${REPRO_PORT:-3003}"
HOST="${REPRO_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"
DEV_LOG="$(mktemp -t resume-repro-dev-log.XXXXXX)"

cleanup() {
  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  echo
  echo "=== dev server log ==="
  cat "$DEV_LOG"
  rm -f "$DEV_LOG"
}

trap cleanup EXIT INT TERM

npm run dev -- --hostname "$HOST" --port "$PORT" >"$DEV_LOG" 2>&1 &
DEV_PID=$!

READY=0
ATTEMPTS=0
while [ "$ATTEMPTS" -lt 60 ]; do
  if curl -sf "$BASE_URL/" >/dev/null 2>&1; then
    READY=1
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "dev server did not become ready in time"
  exit 1
fi

REPRO_BASE_URL="$BASE_URL" node scripts/repro-upload.mjs
