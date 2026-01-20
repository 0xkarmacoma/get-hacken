#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/index.html" "$DIST_DIR/index.html"
cp -R "$ROOT_DIR/src" "$DIST_DIR/src"

printf "Build complete: %s\n" "$DIST_DIR"
