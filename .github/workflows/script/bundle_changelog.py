#!/usr/bin/env python3
import os
import re

cli_version = os.environ['CLI_VERSION']

# Link the GitHub Release corresponding to the new bundle version.
bundle_release_url = f"https://github.com/github/codeql-action/releases/codeql-bundle-v{cli_version}"
bundle_note = f"To learn more about the relevant changes to the CodeQL CLI and language packs, see the [bundle release]({bundle_release_url})."

# Get the PR number from the PR URL.
pr_number = os.environ['PR_URL'].split('/')[-1]
changelog_note = f"- Update default CodeQL bundle version to {cli_version}. {bundle_note} [#{pr_number}]({os.environ['PR_URL']})"

# If the "[UNRELEASED]" section starts with "no user facing changes", remove that line.
with open('CHANGELOG.md', 'r') as f:
    changelog = f.read()

changelog = changelog.replace('## [UNRELEASED]\n\nNo user facing changes.', '## [UNRELEASED]\n')

# Add the changelog note to the bottom of the "[UNRELEASED]" section.
changelog = re.sub(r'\n## (\d+\.\d+\.\d+)', f'{changelog_note}\n\n## \\1', changelog, count=1)

with open('CHANGELOG.md', 'w') as f:
    f.write(changelog)
