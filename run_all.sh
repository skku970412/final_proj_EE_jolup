#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
VENV_BIN="${BACKEND_DIR}/.venv/bin"
APP_MODULE="app.main:app"
HOST_VALUE="${UVICORN_HOST:-0.0.0.0}"
PORT_VALUE="${UVICORN_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${VITE_DEV_SERVER_PORT:-5173}"

if [ ! -d "${BACKEND_DIR}" ]; then
  echo "backend directory not found." >&2
  exit 1
fi

if [ ! -d "${BACKEND_DIR}/.venv" ]; then
  echo "backend/.venv is missing. Run ./setup_all.sh first." >&2
  exit 1
fi

if [ ! -f "${VENV_BIN}/activate" ]; then
  echo "Unable to locate virtual environment activation script." >&2
  exit 1
fi

if [ ! -d "${FRONTEND_DIR}" ] || [ ! -f "${FRONTEND_DIR}/package.json" ]; then
  echo "frontend directory or package.json is missing." >&2
  exit 1
fi

source "${VENV_BIN}/activate"

cd "${BACKEND_DIR}"
uvicorn "${APP_MODULE}" --reload --host "${HOST_VALUE}" --port "${PORT_VALUE}" "$@" &
BACKEND_PID=$!
trap 'kill ${BACKEND_PID} 2>/dev/null || true' EXIT INT TERM

cd "${FRONTEND_DIR}"
exec npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
