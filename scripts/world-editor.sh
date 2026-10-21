#!/usr/bin/env bash
# Opens the IoT Quest Editor, the development-only desktop tool (editor/, see editor/README.md).
# It is never built or deployed. The first run installs Electron into editor/node_modules.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "The editor needs Node.js 20 or newer: https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "The editor needs Node.js 20 or newer (this is $(node -v))." >&2
  exit 1
fi

# The game's own development packages (three.js supplies the editor's gizmo and camera controls).
if [ ! -f node_modules/three/examples/jsm/controls/TransformControls.js ]; then
  echo "Installing the game's development packages…"
  npm install --no-audit --no-fund
fi
# Electron, kept apart from the game's packages so CI and the game never download it.
if [ ! -x editor/node_modules/.bin/electron ]; then
  echo "Installing Electron for the editor (first run only)…"
  npm install --prefix editor --no-audit --no-fund
fi

exec editor/node_modules/.bin/electron editor/main.mjs "$@"
