#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

cd "$PROJECT_DIR"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creando entorno virtual en .venv..."
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "Instalando/actualizando dependencias..."
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "Iniciando servidor en http://127.0.0.1:8000 ..."
exec uvicorn server:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  --reload-exclude ".venv/*" \
  --reload-exclude "venv/*" \
  --reload-exclude "front/*" \
  --reload-exclude "front/.next/*" \
  --reload-exclude "front/node_modules/*"
