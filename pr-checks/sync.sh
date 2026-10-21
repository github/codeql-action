#!/bin/bash
set -e

cd "$(dirname "$0")"

# Run `npm ci` in CI or `npm install` otherwise.
#
# `pr-checks` is an npm workspace of the repository root and the two share a single hoisted
# `node_modules` directory. Running npm from this directory puts it in workspace mode, where it
# ignores the root project's own dependencies by default. `npm ci` would then rebuild the shared
# `node_modules` with only this workspace's dependencies, removing the root's ones, which breaks
# anything that imports from `src` (such as `sync.ts` itself). `--include-workspace-root` keeps the
# root project's dependencies in the installed tree.
if [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "In Actions, running 'npm ci' for 'sync.ts'..."
  npm ci --include-workspace-root
else
  echo "Running 'npm install' for 'sync.ts'..."
  npm install --no-audit --no-fund --include-workspace-root
fi

npx tsx sync.ts
