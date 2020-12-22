#!/bin/bash
set -eu

# Sanity check that repo is clean to start with
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then this workflow needs attention...
    >&2 echo "Failed: Repo should be clean before testing!"
    exit 1
fi
# Wipe the lib directory incase there are extra unnecessary files in there
rm -rf lib
# Generate the JavaScript files
npm run-script build
# Check that repo is still clean
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then the PR needs attention
    >&2 echo "Failed: JavaScript files are not up to date. Run 'npm run-script build' to update"
    git status
    exit 1
fi
echo "Success: JavaScript files are up to date"