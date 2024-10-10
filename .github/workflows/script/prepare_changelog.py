import os
import sys

EMPTY_CHANGELOG = 'No changes.\n\n'

# Prepare the changelog for the new release
# This function will extract the part of the changelog that
# we want to include in the new release.
def extract_changelog_snippet(changelog_file, version_tag):
  output = ''
  if (not os.path.exists(changelog_file)):
    output = EMPTY_CHANGELOG

  else:
    with open('CHANGELOG.md', 'r') as f:
      lines = f.readlines()

      # Include everything up to, but excluding the second heading
      found_first_section = False
      for i, line in enumerate(lines):
        if line.startswith('## '):
          if found_first_section:
            break
          found_first_section = True
        output += line

  output += f"See the full [CHANGELOG.md](https://github.com/github/codeql-action/blob/{version_tag}/CHANGELOG.md) for more information."

  return output


if len(sys.argv) < 3:
  raise Exception('Expecting argument: changelog_file version_tag')
changelog_file = sys.argv[1]
version_tag = sys.argv[2]

print(extract_changelog_snippet(changelog_file, version_tag))
