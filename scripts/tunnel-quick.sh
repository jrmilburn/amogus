#!/usr/bin/env sh
set -eu
# Explicitly run this yourself: it exposes the local Caddy service publicly.
command -v cloudflared >/dev/null 2>&1 || { echo 'Install cloudflared first.' >&2; exit 1; }
exec cloudflared tunnel --url "http://localhost:${HOST_PORT:-8080}"
