#!/bin/bash
set -eu

# Sanity check that repo is clean to start with
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then this workflow needs attention...
    >&2 echo "Failed: Repo should be clean before testing!"
    exit 1
fi
sudo npm install --force -g npm@latest
# Reinstall modules and then clean to remove absolute paths
# Use 'npm ci' instead of 'npm install' as this is intended to be reproducible
npm ci
npm run removeNPMAbsolutePaths
# Check that repo is still clean
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then the PR needs attention
    >&2 echo "Failed: node_modules are not up to date. Run 'npm ci && npm run removeNPMAbsolutePaths' on a macOS machine to update. Note it is important this command is run on macOS and not any other operating system as there is one dependency (fsevents) that is needed for macOS and may not be installed if the command is run on a Windows or Linux machine."
    git status
    exit 1
fi
echo "Success: node_modules are up to date"