#!/bin/bash
set -e

# Check if npm install is likely needed before proceeding
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install
fi
