#!/usr/bin/env bash
# Update the required checks based on the current branch.
# Typically, this will be main.

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Failed: No GitHub token found. This script requires admin access to github/codeql-action."
  exit 1
fi

if [ "$#" -eq 1 ]; then
  # If we were passed an argument, use that as the SHA
  GITHUB_SHA="$0"
elif [ "$#" -gt 1 ]; then
  echo "Usage: $0 [SHA]"
  echo "Update the required checks based on the SHA, or main."
  exit 1
elif [ -z "$GITHUB_SHA" ]; then
  # If we don't have a SHA, use main
  GITHUB_SHA="$(git rev-parse main)"
fi

echo "Getting checks for $GITHUB_SHA"

# Ignore any checks with "https://", CodeQL, LGTM, and Update checks.
CHECKS="$(gh api repos/github/codeql-action/commits/"${GITHUB_SHA}"/check-runs --paginate | jq --slurp --compact-output --raw-output '[.[].check_runs | .[].name | select(contains("https://") or . == ""CodeQL" or . == "LGTM.com" or contains("Update") or contains("update") | not)] | unique | sort')"

echo "$CHECKS" | jq

echo "{\"contexts\": ${CHECKS}}" > checks.json

for BRANCH in main releases/v2 releases/v1; do
  echo "Updating $BRANCH"
  gh api --silent -X "PATCH" "repos/github/codeql-action/branches/$BRANCH/protection/required_status_checks" --input checks.json
done

rm checks.json
