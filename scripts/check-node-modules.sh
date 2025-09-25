#!/bin/bash

set -e

# Check if running in GitHub Actions
if [ "$GITHUB_ACTIONS" = "true" ]; then
  exit 0
fi

# Check if npm install is likely needed before proceeding
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install
fi
