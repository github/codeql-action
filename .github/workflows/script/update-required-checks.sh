#!/usr/bin/env bash
# Update the required checks based on the current branch.
# Typically, this will be main.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
GRANDPARENT_DIR="$(dirname "$REPO_DIR")"
source "$GRANDPARENT_DIR/releases.ini"

if ! gh auth status 2>/dev/null; then
  gh auth status
  echo "Failed: Not authorized. This script requires admin access to github/codeql-action through the gh CLI."
  exit 1
fi

if [ "$#" -eq 1 ]; then
  # If we were passed an argument, use that as the SHA
  GITHUB_SHA="$1"
elif [ "$#" -gt 1 ]; then
  echo "Usage: $0 [SHA]"
  echo "Update the required checks based on the SHA, or main."
  exit 1
elif [ -z "$GITHUB_SHA" ]; then
  # If we don't have a SHA, use main
  GITHUB_SHA="$(git rev-parse main)"
fi

echo "Getting checks for $GITHUB_SHA"

# Ignore any checks with "https://", CodeQL, LGTM, Update, and ESLint checks.
CHECKS="$(gh api repos/github/codeql-action/commits/"${GITHUB_SHA}"/check-runs --paginate | jq --slurp --compact-output --raw-output '[.[].check_runs.[] | select(.conclusion != "skipped") | .name | select(contains("https://") or . == "CodeQL" or . == "Dependabot" or . == "check-expected-release-files" or contains("Update") or contains("ESLint") or contains("update") or contains("test-setup-python-scripts") | not)] | unique | sort')"

echo "$CHECKS" | jq

echo "{\"contexts\": ${CHECKS}}" > checks.json

echo "Updating main"
gh api --silent -X "PATCH" "repos/github/codeql-action/branches/main/protection/required_status_checks" --input checks.json

# list all branchs on origin remote matching releases/v*
BRANCHES="$(git ls-remote --heads origin 'releases/v*' | sed 's?.*refs/heads/??' | sort -V)"

for BRANCH in $BRANCHES; do

  # strip exact 'releases/v' prefix from $BRANCH using count of characters
  VERSION="${BRANCH:10}"

  if [ "$VERSION" -lt "$OLDEST_SUPPORTED_MAJOR_VERSION" ]; then
    echo "Skipping $BRANCH"
    continue
  fi

  echo "Updating $BRANCH"
  gh api --silent -X "PATCH" "repos/github/codeql-action/branches/$BRANCH/protection/required_status_checks" --input checks.json
done

rm checks.json
