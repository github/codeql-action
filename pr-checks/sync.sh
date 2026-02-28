#!/bin/bash
set -e

cd "$(dirname "$0")"

npm install --no-audit --no-fund
npx tsx sync.ts
