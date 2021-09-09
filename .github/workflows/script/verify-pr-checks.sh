#!/bin/bash
set -eu

# Sanity check that repo is clean to start with
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then this workflow needs attention...
    >&2 echo "Failed: Repo should be clean before testing!"
    exit 1
fi

# Wipe the generated PR checks in case there are extra unnecessary files in there
rm -rf .github/workflows/__*

# Generate the PR checks
cd pr-checks && python3 sync.py

# Check that repo is still clean
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then the PR needs attention
    git diff
    git status
    >&2 echo "Failed: PR checks are not up to date. Run 'cd pr-checks && python3 sync.py' to update"
    exit 1
fi
echo "Success: PR checks are up to date"