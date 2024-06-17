import argparse
import datetime
import fileinput
import re
from github import Github
import json
import os
import subprocess

EMPTY_CHANGELOG = """# CodeQL Action Changelog

## [UNRELEASED]

No user facing changes.

"""

# NB: This exact commit message is used to find commits for reverting during backports.
# Changing it requires a transition period where both old and new versions are supported.
BACKPORT_COMMIT_MESSAGE = 'Update version and changelog for v'

# Name of the remote
ORIGIN = 'origin'

# Runs git with the given args and returns the stdout.
# Raises an error if git does not exit successfully (unless passed
# allow_non_zero_exit_code=True).
def run_git(*args, allow_non_zero_exit_code=False):
  cmd = ['git', *args]
  p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  if not allow_non_zero_exit_code and p.returncode != 0:
    raise Exception(f'Call to {" ".join(cmd)} exited with code {p.returncode} stderr: {p.stderr.decode("ascii")}.')
  return p.stdout.decode('ascii')

# Returns true if the given branch exists on the origin remote
def branch_exists_on_remote(branch_name):
  return run_git('ls-remote', '--heads', ORIGIN, branch_name).strip() != ''

# Opens a PR from the given branch to the target branch
def open_pr(
  repo, all_commits, source_branch_short_sha, new_branch_name, source_branch, target_branch,
  conductor, is_primary_release, conflicted_files):
  # Sort the commits into the pull requests that introduced them,
  # and any commits that don't have a pull request
  pull_requests = []
  commits_without_pull_requests = []
  for commit in all_commits:
    pr = get_pr_for_commit(commit)

    if pr is None:
      commits_without_pull_requests.append(commit)
    elif not any(p for p in pull_requests if p.number == pr.number):
      pull_requests.append(pr)

  print(f'Found {len(pull_requests)} pull requests.')
  print(f'Found {len(commits_without_pull_requests)} commits not in a pull request.')

  # Sort PRs and commits by age
  pull_requests = sorted(pull_requests, key=lambda pr: pr.number)
  commits_without_pull_requests = sorted(commits_without_pull_requests, key=lambda c: c.commit.author.date)

  # Start constructing the body text
  body = []
  body.append(f'Merging {source_branch_short_sha} into `{target_branch}`.')

  body.append('')
  body.append(f'Conductor for this PR is @{conductor}.')

  # List all PRs merged
  if len(pull_requests) > 0:
    body.append('')
    body.append('Contains the following pull requests:')
    for pr in pull_requests:
      merger = get_merger_of_pr(repo, pr)
      body.append(f'- #{pr.number} (@{merger})')

  # List all commits not part of a PR
  if len(commits_without_pull_requests) > 0:
    body.append('')
    body.append('Contains the following commits not from a pull request:')
    for commit in commits_without_pull_requests:
      author_description = f' (@{commit.author.login})' if commit.author is not None else ''
      body.append(f'- {commit.sha} - {get_truncated_commit_message(commit)}{author_description}')

  body.append('')
  body.append('Please do the following:')
  if len(conflicted_files) > 0:
    body.append(' - [ ] Ensure `package.json` file contains the correct version.')
    body.append(' - [ ] Add commits to this branch to resolve the merge conflicts ' +
      'in the following files:')
    body.extend([f'    - [ ] `{file}`' for file in conflicted_files])
    body.append(' - [ ] Ensure another maintainer has reviewed the additional commits you added to this ' +
      'branch to resolve the merge conflicts.')
  body.append(' - [ ] Ensure the CHANGELOG displays the correct version and date.')
  body.append(' - [ ] Ensure the CHANGELOG includes all relevant, user-facing changes since the last release.')
  body.append(f' - [ ] Check that there are not any unexpected commits being merged into the `{target_branch}` branch.')
  body.append(' - [ ] Ensure the docs team is aware of any documentation changes that need to be released.')

  if not is_primary_release:
    body.append(' - [ ] Remove and re-add the "Update dependencies" label to the PR to trigger just this workflow.')
    body.append(' - [ ] Wait for the "Update dependencies" workflow to push a commit updating the dependencies.')

  body.append(' - [ ] Mark the PR as ready for review to trigger the full set of PR checks.')
  body.append(' - [ ] Approve and merge this PR. Make sure `Create a merge commit` is selected rather than `Squash and merge` or `Rebase and merge`.')

  if is_primary_release:
    body.append(' - [ ] Merge the mergeback PR that will automatically be created once this PR is merged.')
    body.append(' - [ ] Merge all backport PRs to older release branches, that will automatically be created once this PR is merged.')

  title = f'Merge {source_branch} into {target_branch}'
  labels = ['Update dependencies'] if not is_primary_release else []

  # Create the pull request
  # PR checks won't be triggered on PRs created by Actions. Therefore mark the PR as draft so that
  # a maintainer can take the PR out of draft, thereby triggering the PR checks.
  pr = repo.create_pull(title=title, body='\n'.join(body), head=new_branch_name, base=target_branch, draft=True)
  pr.add_to_labels(*labels)
  print(f'Created PR #{str(pr.number)}')

  # Assign the conductor
  pr.add_to_assignees(conductor)
  print(f'Assigned PR to {conductor}')

# Gets a list of the SHAs of all commits that have happened on the source branch
# since the last release to the target branch.
# This will not include any commits that exist on the target branch
# that aren't on the source branch.
def get_commit_difference(repo, source_branch, target_branch):
  # Passing split nothing means that the empty string splits to nothing: compare `''.split() == []`
  # to `''.split('\n') == ['']`.
  commits = run_git('log', '--pretty=format:%H', f'{ORIGIN}/{target_branch}..{ORIGIN}/{source_branch}').strip().split()

  # Convert to full-fledged commit objects
  commits = [repo.get_commit(c) for c in commits]

  # Filter out merge commits for PRs
  return list(filter(lambda c: not is_pr_merge_commit(c), commits))

# Is the given commit the automatic merge commit from when merging a PR
def is_pr_merge_commit(commit):
  return commit.committer is not None and commit.committer.login == 'web-flow' and len(commit.parents) > 1

# Gets a copy of the commit message that should display nicely
def get_truncated_commit_message(commit):
  message = commit.commit.message.split('\n')[0]
  if len(message) > 60:
    return f'{message[:57]}...'
  else:
    return message

# Converts a commit into the PR that introduced it to the source branch.
# Returns the PR object, or None if no PR could be found.
def get_pr_for_commit(commit):
  prs = commit.get_pulls()

  if prs.totalCount > 0:
    # In the case that there are multiple PRs, return the earliest one
    prs = list(prs)
    sorted_prs = sorted(prs, key=lambda pr: int(pr.number))
    return sorted_prs[0]
  else:
    return None

# Get the person who merged the pull request.
# For most cases this will be the same as the author, but for PRs opened
# by external contributors getting the merger will get us the GitHub
# employee who reviewed and merged the PR.
def get_merger_of_pr(repo, pr):
  return repo.get_commit(pr.merge_commit_sha).author.login

def get_current_version():
  with open('package.json', 'r') as f:
    return json.load(f)['version']

# `npm version` doesn't always work because of merge conflicts, so we
# replace the version in package.json textually.
def replace_version_package_json(prev_version, new_version):
  prev_line_is_codeql = False
  for line in fileinput.input('package.json', inplace = True, encoding='utf-8'):
    if prev_line_is_codeql and f'\"version\": \"{prev_version}\"' in line:
      print(line.replace(prev_version, new_version), end='')
    else:
      prev_line_is_codeql = False
      print(line, end='') 
    if '\"name\": \"codeql\",' in line:
        prev_line_is_codeql = True 

def get_today_string():
  today = datetime.datetime.today()
  return '{:%d %b %Y}'.format(today)

def process_changelog_for_backports(source_branch_major_version, target_branch_major_version):

  # changelog entries can use the following format to indicate
  # that they only apply to newer versions
  some_versions_only_regex = re.compile(r'\[v(\d+)\+ only\]')

  output = ''

  with open('CHANGELOG.md', 'r') as f:

    # until we find the first section, just duplicate all lines
    found_first_section = False
    while not found_first_section:
      line = f.readline()
      if not line:
        raise Exception('Could not find any change sections in CHANGELOG.md') # EOF

      if line.startswith('## '):
        line = line.replace(f'## {source_branch_major_version}', f'## {target_branch_major_version}')
        found_first_section = True

      output += line

    # found_content tracks whether we hit two headings in a row
    found_content = False
    output += '\n'
    while True:
      line = f.readline()
      if not line:
        break # EOF
      line = line.rstrip('\n')

      # filter out changenote entries that apply only to newer versions
      match = some_versions_only_regex.search(line)
      if match:
        if int(target_branch_major_version) < int(match.group(1)):
          continue

      if line.startswith('## '):
        line = line.replace(f'## {source_branch_major_version}', f'## {target_branch_major_version}')
        if found_content == False:
          # we have found two headings in a row, so we need to add the placeholder message.
          output += 'No user facing changes.\n'
        found_content = False
        output += f'\n{line}\n\n'
      else:
        if line.strip() != '':
          found_content = True
          # we use the original line here, rather than the stripped version
          # so that we preserve indentation
          output += line + '\n'

    with open('CHANGELOG.md', 'w') as f:
      f.write(output)

def update_changelog(version):
  if (os.path.exists('CHANGELOG.md')):
    content = ''
    with open('CHANGELOG.md', 'r') as f:
      content = f.read()
  else:
    content = EMPTY_CHANGELOG

  newContent = content.replace('[UNRELEASED]', f'{version} - {get_today_string()}', 1)

  with open('CHANGELOG.md', 'w') as f:
    f.write(newContent)


def main():
  parser = argparse.ArgumentParser('update-release-branch.py')

  parser.add_argument(
    '--github-token',
    type=str,
    required=True,
    help='GitHub token, typically from GitHub Actions.'
  )
  parser.add_argument(
    '--repository-nwo',
    type=str,
    required=True,
    help='The nwo of the repository, for example github/codeql-action.'
  )
  parser.add_argument(
    '--source-branch',
    type=str,
    required=True,
    help='Source branch for release branch update.'
  )
  parser.add_argument(
    '--target-branch',
    type=str,
    required=True,
    help='Target branch for release branch update.'
  )
  parser.add_argument(
    '--is-primary-release',
    action='store_true',
    default=False,
    help='Whether this update is the primary release for the current major version.'
  )
  parser.add_argument(
    '--conductor',
    type=str,
    required=True,
    help='The GitHub handle of the person who is conducting the release process.'
  )

  args = parser.parse_args()

  source_branch = args.source_branch
  target_branch = args.target_branch
  is_primary_release = args.is_primary_release

  repo = Github(args.github_token).get_repo(args.repository_nwo)

  # the target branch will be of the form releases/vN, where N is the major version number
  target_branch_major_version = target_branch.strip('releases/v')

  # split version into major, minor, patch
  _, v_minor, v_patch = get_current_version().split('.')

  version = f"{target_branch_major_version}.{v_minor}.{v_patch}"

  # Print what we intend to go
  print(f'Considering difference between {source_branch} and {target_branch}...')
  source_branch_short_sha = run_git('rev-parse', '--short', f'{ORIGIN}/{source_branch}').strip()
  print(f'Current head of {source_branch} is {source_branch_short_sha}.')

  # See if there are any commits to merge in
  commits = get_commit_difference(repo=repo, source_branch=source_branch, target_branch=target_branch)
  if len(commits) == 0:
    print(f'No commits to merge from {source_branch} to {target_branch}.')
    return

  # define distinct prefix in order to support specific pr checks on backports
  branch_prefix = 'update' if is_primary_release else 'backport'

  # The branch name is based off of the name of branch being merged into
  # and the SHA of the branch being merged from. Thus if the branch already
  # exists we can assume we don't need to recreate it.
  new_branch_name = f'{branch_prefix}-v{version}-{source_branch_short_sha}'
  print(f'Branch name is {new_branch_name}.')

  # Check if the branch already exists. If so we can abort as this script
  # has already run on this combination of branches.
  if branch_exists_on_remote(new_branch_name):
    print(f'Branch {new_branch_name} already exists. Nothing to do.')
    return

  # Create the new branch and push it to the remote
  print(f'Creating branch {new_branch_name}.')

  # The process of creating the v{Older} release can run into merge conflicts. We commit the unresolved
  # conflicts so a maintainer can easily resolve them (vs erroring and requiring maintainers to
  # reconstruct the release manually)
  conflicted_files = []

  if not is_primary_release:

    # the source branch will be of the form releases/vN, where N is the major version number
    source_branch_major_version = source_branch.strip('releases/v')

    # If we're performing a backport, start from the target branch
    print(f'Creating {new_branch_name} from the {ORIGIN}/{target_branch} branch')
    run_git('checkout', '-b', new_branch_name, f'{ORIGIN}/{target_branch}')

    # Revert the commit that we made as part of the last release that updated the version number and
    # changelog to refer to {older}.x.x variants. This avoids merge conflicts in the changelog and
    # package.json files when we merge in the v{latest} branch.
    # This commit will not exist the first time we release the v{N-1} branch from the v{N} branch, so we
    # use `git log --grep` to conditionally revert the commit.
    print('Reverting the version number and changelog updates from the last release to avoid conflicts')
    vOlder_update_commits = run_git('log', '--grep', f'^{BACKPORT_COMMIT_MESSAGE}', '--format=%H').split()

    if len(vOlder_update_commits) > 0:
      print(f'  Reverting {vOlder_update_commits[0]}')
      # Only revert the newest commit as older ones will already have been reverted in previous
      # releases.
      run_git('revert', vOlder_update_commits[0], '--no-edit')

      # Also revert the "Update checked-in dependencies" commit created by Actions.
      update_dependencies_commit = run_git('log', '--grep', '^Update checked-in dependencies', '--format=%H').split()[0]
      print(f'  Reverting {update_dependencies_commit}')
      run_git('revert', update_dependencies_commit, '--no-edit')

    else:
      print('  Nothing to revert.')

    print(f'Merging {ORIGIN}/{source_branch} into the release prep branch')
    # Commit any conflicts (see the comment for `conflicted_files`)
    run_git('merge', f'{ORIGIN}/{source_branch}', allow_non_zero_exit_code=True)
    conflicted_files = run_git('diff', '--name-only', '--diff-filter', 'U').splitlines()
    if len(conflicted_files) > 0:
      run_git('add', '.')
      run_git('commit', '--no-edit')

    # Migrate the package version number from a vLatest version number to a vOlder version number
    print(f'Setting version number to {version} in package.json')
    replace_version_package_json(get_current_version(), version) # We rely on the `Update dependencies` workflow to update package-lock.json
    run_git('add', 'package.json')

    # Migrate the changelog notes from vLatest version numbers to vOlder version numbers
    print(f'Migrating changelog notes from v{source_branch_major_version} to v{target_branch_major_version}')
    process_changelog_for_backports(source_branch_major_version, target_branch_major_version)

    # Amend the commit generated by `npm version` to update the CHANGELOG
    run_git('add', 'CHANGELOG.md')
    run_git('commit', '-m', f'{BACKPORT_COMMIT_MESSAGE}{version}')
  else:
    # If we're performing a standard release, there won't be any new commits on the target branch,
    # as these will have already been merged back into the source branch. Therefore we can just
    # start from the source branch.
    run_git('checkout', '-b', new_branch_name, f'{ORIGIN}/{source_branch}')

    print('Updating changelog')
    update_changelog(version)

    # Create a commit that updates the CHANGELOG
    run_git('add', 'CHANGELOG.md')
    run_git('commit', '-m', f'Update changelog for v{version}')

  run_git('push', ORIGIN, new_branch_name)

  # Open a PR to update the branch
  open_pr(
    repo,
    commits,
    source_branch_short_sha,
    new_branch_name,
    source_branch=source_branch,
    target_branch=target_branch,
    conductor=args.conductor,
    is_primary_release=is_primary_release,
    conflicted_files=conflicted_files
  )

if __name__ == '__main__':
  main()
