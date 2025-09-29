#!/bin/bash
set -eu

# Change @types/node to v20 temporarily to check that the generated JS files are correct.
contents=$(jq '.devDependencies."@types/node" = "^20.0.0"' package.json)
echo "${contents}" > package.json

npm install

if [ ! -z "$(git status --porcelain)" ]; then
    git config --global user.email "github-actions@github.com"
    git config --global user.name "github-actions[bot]"
    # The period in `git add --all .` ensures that we stage deleted files too.
    git add --all .
    git commit -m "Use @types/node v20"
fi

# Wipe the lib directory in case there are extra unnecessary files in there
rm -rf lib

# Generate the JavaScript files
npm run-script build

# Check that repo is still clean.
# The downgrade of @types/node means that we expect certain changes to the generated JS files.
# Therefore, we should ignore these changes to @types/node and check for outstanding changes.
if [[ $(git diff | grep --perl-regexp '^-(?!--)' | grep --count --invert-match --perl-regexp '"@types/node": "\^24') -gt 0 || \
      $(git diff | grep --perl-regexp '^\+(?!\+\+)' | grep --count --invert-match --perl-regexp '"@types/node": "\^20') -gt 0 ]]
then
    >&2 echo "Failed: JavaScript files are not up to date. Run 'rm -rf lib && npm run-script build' to update"
    git diff
    exit 1
fi
echo "Success: JavaScript files are up to date"

# Clean up changes to package.json, package-lock.json, and lib/*.js.
git reset --hard HEAD~1
