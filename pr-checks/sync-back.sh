#!/bin/bash

# Sync-back wrapper script
# This script runs the sync-back.py Python script to automatically sync 
# Dependabot action version updates back to the source templates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_BACK_PY="${SCRIPT_DIR}/sync-back.py"

# Check if Python script exists
if [[ ! -f "$SYNC_BACK_PY" ]]; then
    echo "Error: sync-back.py not found at $SYNC_BACK_PY" >&2
    exit 1
fi

# Make sure the Python script is executable
chmod +x "$SYNC_BACK_PY"

# Run the sync-back script with all provided arguments
echo "Running sync-back automation..."
python3 "$SYNC_BACK_PY" "$@"

echo "Sync-back completed successfully."