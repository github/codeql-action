import argparse
import datetime
from github import Github
import json
import os
import subprocess

EMPTY_CHANGELOG = """# CodeQL Action and CodeQL Runner Changelog

## [UNRELEASED]

No user facing changes.

"""

# Value of the mode flag for a v1 release
V1_MODE = 'v1-release'

# Value of the mode flag for a v2 release
V2_MODE = 'v2-release'

SOURCE_BRANCH_FOR_MODE = { V1_MODE: 'releases/v2', V2_MODE: 'main' }
TARGET_BRANCH_FOR_MODE = { V1_MODE: 'releases/v1', V2_MODE: 'releases/v2' }

# Name of the remote
ORIGIN = 'origin'

# Runs git with the given args and returns the stdout.
# Raises an error if git does not exit successfully.
def run_git(*args):
  cmd = ['git', *args]
  p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  if (p.returncode != 0):
    raise Exception('Call to ' + ' '.join(cmd) + ' exited with code ' + str(p.returncode) + ' stderr:' + p.stderr.decode('ascii'))
  return p.stdout.decode('ascii')

# Returns true if the given branch exists on the origin remote
def branch_exists_on_remote(branch_name):
  return run_git('ls-remote', '--heads', ORIGIN, branch_name).strip() != ''

# Opens a PR from the given branch to the target branch
def open_pr(repo, all_commits, source_branch_short_sha, new_branch_name, source_branch, target_branch, conductor, is_v2_release, labels):
  # Sort the commits into the pull requests that introduced them,
  # and any commits that don't have a pull request
  pull_requests = []
  commits_without_pull_requests = []
  for commit in all_commits:
    pr = get_pr_for_commit(repo, commit)

    if pr is None:
      commits_without_pull_requests.append(commit)
    elif not any(p for p in pull_requests if p.number == pr.number):
      pull_requests.append(pr)

  print('Found ' + str(len(pull_requests)) + ' pull requests')
  print('Found ' + str(len(commits_without_pull_requests)) + ' commits not in a pull request')

  # Sort PRs and commits by age
  pull_requests = sorted(pull_requests, key=lambda pr: pr.number)
  commits_without_pull_requests = sorted(commits_without_pull_requests, key=lambda c: c.commit.author.date)

  # Start constructing the body text
  body = []
  body.append('Merging ' + source_branch_short_sha + ' into ' + target_branch)

  body.append('')
  body.append('Conductor for this PR is @' + conductor)

  # List all PRs merged
  if len(pull_requests) > 0:
    body.append('')
    body.append('Contains the following pull requests:')
    for pr in pull_requests:
      merger = get_merger_of_pr(repo, pr)
      body.append('- #' + str(pr.number) + ' - ' + pr.title +' (@' + merger + ')')

  # List all commits not part of a PR
  if len(commits_without_pull_requests) > 0:
    body.append('')
    body.append('Contains the following commits not from a pull request:')
    for commit in commits_without_pull_requests:
      author_description = ' (@' + commit.author.login + ')' if commit.author is not None else ''
      body.append('- ' + commit.sha + ' - ' + get_truncated_commit_message(commit) + author_description)

  body.append('')
  body.append('Please review the following:')
  body.append(' - [ ] The CHANGELOG displays the correct version and date.')
  body.append(' - [ ] The CHANGELOG includes all relevant, user-facing changes since the last release.')
  body.append(' - [ ] There are no unexpected commits being merged into the ' + target_branch + ' branch.')
  body.append(' - [ ] The docs team is aware of any documentation changes that need to be released.')
  if is_v2_release:
    body.append(' - [ ] The mergeback PR is merged back into ' + source_branch + ' after this PR is merged.')
    body.append(' - [ ] The v1 release PR is merged after this PR is merged.')

  title = 'Merge ' + source_branch + ' into ' + target_branch

  # Create the pull request
  # PR checks won't be triggered on PRs created by Actions. Therefore mark the PR as draft so that
  # a maintainer can take the PR out of draft, thereby triggering the PR checks.
  pr = repo.create_pull(title=title, body='\n'.join(body), head=new_branch_name, base=target_branch, draft=True)
  pr.add_to_labels(*labels)
  print('Created PR #' + str(pr.number))

  # Assign the conductor
  pr.add_to_assignees(conductor)
  print('Assigned PR to ' + conductor)

# Gets a list of the SHAs of all commits that have happened on the source branch
# since the last release to the target branch.
# This will not include any commits that exist on the target branch
# that aren't on the source branch.
def get_commit_difference(repo, source_branch, target_branch):
  # Passing split nothing means that the empty string splits to nothing: compare `''.split() == []`
  # to `''.split('\n') == ['']`.
  commits = run_git('log', '--pretty=format:%H', ORIGIN + '/' + target_branch + '..' + ORIGIN + '/' + source_branch).strip().split()

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
    return message[:57] + '...'
  else:
    return message

# Converts a commit into the PR that introduced it to the source branch.
# Returns the PR object, or None if no PR could be found.
def get_pr_for_commit(repo, commit):
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

def get_today_string():
  today = datetime.datetime.today()
  return '{:%d %b %Y}'.format(today)

def update_changelog(version):
  if (os.path.exists('CHANGELOG.md')):
    content = ''
    with open('CHANGELOG.md', 'r') as f:
      content = f.read()
  else:
    content = EMPTY_CHANGELOG

  newContent = content.replace('[UNRELEASED]', version + ' - ' + get_today_string(), 1)

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
    '--mode',
    type=str,
    required=True,
    choices=[V2_MODE, V1_MODE],
    help=f"Which release to perform. '{V2_MODE}' uses {SOURCE_BRANCH_FOR_MODE[V2_MODE]} as the source " +
      f"branch and {TARGET_BRANCH_FOR_MODE[V2_MODE]} as the target branch. " +
      f"'{V1_MODE}' uses {SOURCE_BRANCH_FOR_MODE[V1_MODE]} as the source branch and " +
      f"{TARGET_BRANCH_FOR_MODE[V1_MODE]} as the target branch."
  )
  parser.add_argument(
    '--conductor',
    type=str,
    required=True,
    help='The GitHub handle of the person who is conducting the release process.'
  )

  args = parser.parse_args()

  source_branch = SOURCE_BRANCH_FOR_MODE[args.mode]
  target_branch = TARGET_BRANCH_FOR_MODE[args.mode]

  repo = Github(args.github_token).get_repo(args.repository_nwo)
  version = get_current_version()

  if args.mode == V1_MODE:
    # Change the version number to a v1 equivalent
    version = get_current_version()
    version = f'1{version[1:]}'

  # Print what we intend to go
  print('Considering difference between ' + source_branch + ' and ' + target_branch)
  source_branch_short_sha = run_git('rev-parse', '--short', ORIGIN + '/' + source_branch).strip()
  print('Current head of ' + source_branch + ' is ' + source_branch_short_sha)

  # See if there are any commits to merge in
  commits = get_commit_difference(repo=repo, source_branch=source_branch, target_branch=target_branch)
  if len(commits) == 0:
    print('No commits to merge from ' + source_branch + ' to ' + target_branch)
    return

  # The branch name is based off of the name of branch being merged into
  # and the SHA of the branch being merged from. Thus if the branch already
  # exists we can assume we don't need to recreate it.
  new_branch_name = 'update-v' + version + '-' + source_branch_short_sha
  print('Branch name is ' + new_branch_name)

  # Check if the branch already exists. If so we can abort as this script
  # has already run on this combination of branches.
  if branch_exists_on_remote(new_branch_name):
    print('Branch ' + new_branch_name + ' already exists. Nothing to do.')
    return

  # Create the new branch and push it to the remote
  print('Creating branch ' + new_branch_name)

  if args.mode == V1_MODE:
    # If we're performing a backport, start from the target branch
    print(f'Creating {new_branch_name} from the {ORIGIN}/{target_branch} branch')
    run_git('checkout', '-b', new_branch_name, f'{ORIGIN}/{target_branch}')

    # Revert the commit that we made as part of the last release that updated the version number and
    # changelog to refer to 1.x.x variants. This avoids merge conflicts in the changelog and
    # package.json files when we merge in the v2 branch.
    # This commit will not exist the first time we release the v1 branch from the v2 branch, so we
    # use `git log --grep` to conditionally revert the commit.
    print('Reverting the 1.x.x version number and changelog updates from the last release to avoid conflicts')
    v1_update_commits = run_git('log', '--grep', '^Update version and changelog for v', '--format=%H').split()

    if len(v1_update_commits) > 0:
      print(f'  Reverting {v1_update_commits[0]}')
      # Only revert the newest commit as older ones will already have been reverted in previous
      # releases.
      run_git('revert', v1_update_commits[0], '--no-edit')

      # Also revert the "Update checked-in dependencies" commit created by Actions.
      update_dependencies_commit = run_git('log', '--grep', '^Update checked-in dependencies', '--format=%H').split()[0]
      print(f'  Reverting {update_dependencies_commit}')
      run_git('revert', update_dependencies_commit, '--no-edit')

    else:
      print('  Nothing to revert.')

    print(f'Merging {ORIGIN}/{source_branch} into the release prep branch')
    run_git('merge', f'{ORIGIN}/{source_branch}', '--no-edit')

    # Migrate the package version number from a v2 version number to a v1 version number
    print(f'Setting version number to {version}')
    subprocess.run(['npm', 'version', version, '--no-git-tag-version'])
    run_git('add', 'package.json', 'package-lock.json')

    # Migrate the changelog notes from v2 version numbers to v1 version numbers
    print('Migrating changelog notes from v2 to v1')
    subprocess.run(['sed', '-i', 's/^## 2\./## 1./g', 'CHANGELOG.md'])

    # Remove changelog notes from v2 that don't apply to v1
    subprocess.run(['sed', '-i', '/^- \[v2+ only\]/d', 'CHANGELOG.md'])

    # Amend the commit generated by `npm version` to update the CHANGELOG
    run_git('add', 'CHANGELOG.md')
    run_git('commit', '-m', f'Update version and changelog for v{version}')
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
    is_v2_release=args.mode == V2_MODE,
    labels=['Update dependencies'] if args.mode == V1_MODE else [],
  )

if __name__ == '__main__':
  main()
