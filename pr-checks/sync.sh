#!/bin/bash
set -e

cd "$(dirname "$0")"

# Run `npm ci` in CI or `npm install` otherwise.
if [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "In Actions, running 'npm ci' for 'sync.ts'..."
  npm ci
else
  echo "Running 'npm install' for 'sync.ts'..."
  npm install --no-audit --no-fund
fi

npx tsx sync.ts
