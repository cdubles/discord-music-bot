#!/usr/bin/env bash
#
# Deploy the bot on an EC2 instance (or any Docker host).
#
#   ./scripts/ec2-deploy.sh
#
# Expects to run from the repo root on the host, with a .env file present.
# Building on a t3.micro can OOM while compiling native modules — prefer
# building elsewhere and pulling the image, or add swap first.

set -euo pipefail

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "error: .env not found. Copy .env.example and fill it in." >&2
  exit 1
fi

echo "==> Pulling latest source"
git pull --ff-only

echo "==> Building image"
docker compose ${COMPOSE_FILES} build

echo "==> Restarting service"
docker compose ${COMPOSE_FILES} up -d

echo "==> Pruning old images"
docker image prune -f

echo "==> Status"
docker compose ${COMPOSE_FILES} ps

echo
echo "Tail logs with:"
echo "  docker compose ${COMPOSE_FILES} logs -f"
