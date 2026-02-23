#!/usr/bin/env python3
import os
import sys

EMPTY_CHANGELOG = 'No changes.\n\n'

# Prepare the changelog for the new release
# This function will extract the part of the changelog that
# we want to include in the new release.
def extract_changelog_snippet(changelog_file):
  output = ''
  if (not os.path.exists(changelog_file)):
    output = EMPTY_CHANGELOG

  else:
    with open(changelog_file, 'r') as f:
      lines = f.readlines()

      # Include only the contents of the first section
      found_first_section = False
      for line in lines:
        if line.startswith('## '):
          if found_first_section:
            break
          found_first_section = True
        elif found_first_section:
          output += line

  return output.strip()


if len(sys.argv) < 2:
  raise Exception('Expecting argument: changelog_file')
changelog_file = sys.argv[1]
print(extract_changelog_snippet(changelog_file))
