#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONT_DIR="$PROJECT_DIR/front"

cd "$FRONT_DIR"

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
