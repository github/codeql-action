import argparse
import json
import os
import configparser

# Name of the remote
ORIGIN = 'origin'

script_dir = os.path.dirname(os.path.realpath(__file__))
grandparent_dir = os.path.dirname(os.path.dirname(script_dir))

config = configparser.ConfigParser()
with open(os.path.join(grandparent_dir, 'releases.ini')) as stream:
    config.read_string('[default]\n' + stream.read())

OLDEST_SUPPORTED_MAJOR_VERSION = int(config['default']['OLDEST_SUPPORTED_MAJOR_VERSION'])

def main():

  parser = argparse.ArgumentParser()
  parser.add_argument("--major-version", required=True, type=str, help="The major version of the release")
  parser.add_argument("--latest-tag", required=True, type=str, help="The most recent tag published to the repository")
  args = parser.parse_args()

  major_version = args.major_version
  latest_tag = args.latest_tag

  print("major_version: " + major_version)
  print("latest_tag: " + latest_tag)

  # If this is a primary release, we backport to all supported branches,
  # so we check whether the major_version taken from the package.json
  # is greater than or equal to the latest tag pulled from the repo.
  # For example...
  #     'v1' >= 'v2' is False # we're operating from an older release branch and should not backport
  #     'v2' >= 'v2' is True  # the normal case where we're updating the current version
  #     'v3' >= 'v2' is True  # in this case we are making the first release of a new major version
  consider_backports = ( major_version >= latest_tag.split(".")[0] )

  with open(os.environ["GITHUB_OUTPUT"], "a") as f:

    f.write(f"backport_source_branch=releases/{major_version}\n")

    backport_target_branches = []

    if consider_backports:
      for i in range(int(major_version.strip("v"))-1, 0, -1):
        branch_name = f"releases/v{i}"
        if i >= OLDEST_SUPPORTED_MAJOR_VERSION:
          backport_target_branches.append(branch_name)

    f.write("backport_target_branches="+json.dumps(backport_target_branches)+"\n")

if __name__ == "__main__":
  main()
