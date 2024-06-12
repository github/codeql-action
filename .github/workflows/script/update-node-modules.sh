#!/bin/bash
set -eu

if [ "$1" != "update" ] && [ "$1" != "check-only" ]; then
    >&2 echo "Failed: Invalid argument. Must be 'update' or 'check-only'"
    exit 1
fi

npm install --force -g npm@9.2.0

# clean the npm cache to ensure we don't have any files owned by root
sudo npm cache clean --force

if [ "$1" = "update" ]; then
    npm install
fi

# Reinstall modules and then clean to remove absolute paths
# Use 'npm ci' instead of 'npm install' as this is intended to be reproducible
npm ci
npm run removeNPMAbsolutePaths
