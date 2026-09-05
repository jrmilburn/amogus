#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "Copy .env.example to .env and set TUNNEL_TOKEN and PUBLIC_URL first." >&2
  exit 1
fi
# Parse Compose's .env format without executing the file as shell code.
docker compose config --quiet
public_url=$(docker compose config --environment | sed -n 's/^PUBLIC_URL=//p')
if [[ "$public_url" != https://* || "$public_url" == *example.com* ]]; then
  echo "Set PUBLIC_URL in .env to your https:// Cloudflare hostname." >&2
  exit 1
fi
pnpm install --frozen-lockfile
pnpm --filter @mutiny/client... build
docker compose up -d --build
echo "Hosting started. Once the tunnel connects, open: $public_url"
echo "Check service status with: docker compose ps"
