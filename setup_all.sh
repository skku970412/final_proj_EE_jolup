#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

if [ ! -d "${BACKEND_DIR}" ]; then
  echo "backend directory not found." >&2
  exit 1
fi

if [ ! -f "${BACKEND_DIR}/setup.sh" ]; then
  echo "backend/setup.sh script is missing." >&2
  exit 1
fi

(
  cd "${BACKEND_DIR}"
  bash ./setup.sh "$@"
)

if [ ! -d "${FRONTEND_DIR}" ] || [ ! -f "${FRONTEND_DIR}/package.json" ]; then
  echo "frontend directory or package.json is missing." >&2
  exit 1
fi

(
  cd "${FRONTEND_DIR}"
  npm install
)
