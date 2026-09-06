#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:-}
if [[ $# -gt 1 || ( -n "$mode" && "$mode" != --local ) ]]; then
  echo "Usage: $0 [--local]" >&2
  exit 1
fi
if [[ "$mode" != --local && ! -f .env ]]; then
  echo "Copy .env.example to .env and set TUNNEL_TOKEN and PUBLIC_URL first." >&2
  exit 1
fi
# Parse Compose's .env format without executing the file as shell code.
docker compose config --quiet
if [[ "$mode" != --local ]]; then
  public_url=$(docker compose config --environment | sed -n 's/^PUBLIC_URL=//p')
  tunnel_token=$(docker compose config --environment | sed -n 's/^TUNNEL_TOKEN=//p')
  if [[ -z "$tunnel_token" ]]; then
    echo "Set TUNNEL_TOKEN in .env to the Cloudflare connector token." >&2
    exit 1
  fi
  unset tunnel_token
  if [[ "$public_url" != https://* || "$public_url" == *example.com* ]]; then
    echo "Set PUBLIC_URL in .env to your https:// Cloudflare hostname." >&2
    exit 1
  fi
fi
docker compose up -d --build --wait server caddy
if [[ "$mode" == --local ]]; then
  host_port=$(docker compose config --environment | sed -n 's/^HOST_PORT=//p')
  echo "Local hosting ready: http://localhost:${host_port:-8080}"
else
  docker compose up -d cloudflared
  echo "Hosting started. Once the tunnel connects, open: $public_url"
fi
echo "Check service status with: docker compose ps"
