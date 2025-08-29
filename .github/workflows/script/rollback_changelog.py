import datetime
import os
import argparse

EMPTY_CHANGELOG = """# CodeQL Action Changelog

"""

def get_today_string():
  today = datetime.datetime.today()
  return '{:%d %b %Y}'.format(today)

# Include everything up to and after the first heading,
# but not the first heading and body.
def drop_unreleased_section(lines: list[str]):
  before_first_section = ''
  after_first_section = ''
  found_first_section = False
  skipped_first_section = False

  for i, line in enumerate(lines):
    if line.startswith('## ') and not found_first_section:
      found_first_section = True
    elif line.startswith('## ') and found_first_section:
      skipped_first_section = True

    if not found_first_section:
      before_first_section += line
    if skipped_first_section:
      after_first_section += line

  return (before_first_section, after_first_section)

def update_changelog(target_version, rollback_version, new_version):
  before_first_section = EMPTY_CHANGELOG
  after_first_section = ''

  if (os.path.exists('CHANGELOG.md')):
    with open('CHANGELOG.md', 'r') as f:
      (before_first_section, after_first_section) = drop_unreleased_section(f.readlines())

  newHeader = f'## {new_version} - {get_today_string()}\n'

  print(before_first_section, end="")
  print(newHeader)
  print(f"This release rolls back {rollback_version} due to issues with that release. It is identical to {target_version}.\n")
  print(after_first_section)

# We expect three version strings as input:
#
# - target_version: the version that we are re-releasing as `new_version`
# - rollback_version: the version that we are rolling back, typically the one that followed `target_version`
# - new_version: the new version that we are releasing `target_version` as, typically the one that follows `rollback_version`
#
# Example: python3 .github/workflows/script/rollback_changelog.py --target-version "1.2.3" --rollback-version "1.2.4" --new-version "1.2.5"
parser = argparse.ArgumentParser(description="Update CHANGELOG.md for a rollback release.")
parser.add_argument("--target-version", "-t", required=True, help="Version to re-release as new_version.")
parser.add_argument("--rollback-version", "-r", required=True, help="Version being rolled back.")
parser.add_argument("--new-version", "-n", required=True, help="New version to publish for target_version.")
args = parser.parse_args()

update_changelog(args.target_version, args.rollback_version, args.new_version)
