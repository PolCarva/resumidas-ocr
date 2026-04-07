#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_PID=""
FRONT_PID=""

stop_port_listener() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [ -z "$pids" ]; then
    return
  fi

  echo "Liberando puerto $port..."
  kill $pids 2>/dev/null || true
  sleep 1

  local remaining
  remaining="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$remaining" ]; then
    kill -9 $remaining 2>/dev/null || true
  fi
}

cleanup() {
  for pid in "$BACK_PID" "$FRONT_PID"; do
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Levantando backend y frontend de OCR Free..."

stop_port_listener 3000
stop_port_listener 3001
stop_port_listener 8000

(
  cd "$PROJECT_DIR"
  exec ./run.sh
) &
BACK_PID=$!

(
  cd "$PROJECT_DIR"
  exec ./run_front.sh
) &
FRONT_PID=$!

echo "Backend PID: $BACK_PID"
echo "Frontend PID: $FRONT_PID"
echo "Frontend: http://127.0.0.1:3000"
echo "Backend:  http://127.0.0.1:8000"

while true; do
  if ! kill -0 "$BACK_PID" 2>/dev/null; then
    wait "$BACK_PID"
    exit $?
  fi

  if ! kill -0 "$FRONT_PID" 2>/dev/null; then
    wait "$FRONT_PID"
    exit $?
  fi

  sleep 1
done
