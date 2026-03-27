#!/usr/bin/env bash
set -euo pipefail

HOST="docker"

ssh "$HOST" bash -s <<'REMOTE'
  SERVICES_DIR="$HOME/services"
  REPO="$SERVICES_DIR/inkframe"

  if [ ! -d "$REPO" ]; then
    git clone https://github.com/jmeiss/inkframe.git "$REPO"
  else
    git -C "$REPO" pull --ff-only
  fi

  cd "$REPO"

  COMMIT_HASH=$(git rev-parse --short HEAD)
  docker compose build --build-arg COMMIT_HASH="$COMMIT_HASH"
  docker compose down
  docker compose up -d

  # Wait for healthcheck (start_period is 10s, interval is 30s)
  echo "==> Waiting for healthcheck..."
  for i in $(seq 1 6); do
    STATUS=$(docker inspect --format '{{.State.Health.Status}}' inkframe 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
      echo "==> Healthy!"
      break
    fi
    if [ "$i" -eq 6 ]; then
      echo "==> Warning: not yet healthy (status: $STATUS)"
      docker logs --tail 10 inkframe
    else
      sleep 10
    fi
  done

  echo "==> Deployed commit: $COMMIT_HASH"
REMOTE
