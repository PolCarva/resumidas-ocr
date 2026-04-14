#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONT_DIR="$PROJECT_DIR/front"

stop_existing_next_dev() {
  local pattern="$FRONT_DIR/node_modules/.bin/next dev"
  local pids
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"

  if [ -z "$pids" ]; then
    return
  fi

  echo "Cerrando instancias previas de Next para este frontend..."
  kill $pids 2>/dev/null || true
  sleep 1

  local remaining
  remaining="$(pgrep -f "$pattern" 2>/dev/null || true)"
  if [ -n "$remaining" ]; then
    kill -9 $remaining 2>/dev/null || true
  fi
}

cd "$FRONT_DIR"

stop_existing_next_dev

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias del frontend..."
  npm install
fi

if [ ! -f ".env.local" ] && [ -f ".env.local.example" ]; then
  cp ".env.local.example" ".env.local"
fi

if [ -d ".next" ]; then
  echo "Limpiando cache local de Next..."
  rm -rf ".next"
fi

echo "Iniciando frontend en http://127.0.0.1:3000 ..."
exec npm run dev -- --hostname 0.0.0.0 --port 3000
