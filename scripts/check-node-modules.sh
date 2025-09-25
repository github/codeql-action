#!/bin/bash

set -e

# Check if running in GitHub Actions
if [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "Running in a GitHub Actions workflow; not running 'npm install'"
  exit 0
fi

# Check if npm install is likely needed before proceeding
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Running 'npm install' because 'node_modules/.package-lock.json' appears to be outdated..."
  npm install
else
  echo "Skipping 'npm install' because 'node_modules/.package-lock.json' appears to be up-to-date."
fi
