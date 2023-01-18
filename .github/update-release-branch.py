import argparse
import datetime
from github import Github
import json
import os
import subprocess

EMPTY_CHANGELOG = """# CodeQL Action Changelog

## [UNRELEASED]

No user facing changes.

"""

SOURCE_BRANCH = 'main'
TARGET_BRANCH = 'releases/v2'

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
def open_pr(repo, all_commits, source_branch_short_sha, new_branch_name, conductor):
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
  body.append(f'Merging {source_branch_short_sha} into {TARGET_BRANCH}.')

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
  body.append(' - [ ] Ensure the CHANGELOG displays the correct version and date.')
  body.append(' - [ ] Ensure the CHANGELOG includes all relevant, user-facing changes since the last release.')
  body.append(f' - [ ] Check that there are not any unexpected commits being merged into the {TARGET_BRANCH} branch.')
  body.append(' - [ ] Ensure the docs team is aware of any documentation changes that need to be released.')
  body.append(' - [ ] Approve and merge this PR. Make sure `Create a merge commit` is selected rather than `Squash and merge` or `Rebase and merge`.')
  body.append(' - [ ] Merge the mergeback PR that will automatically be created once this PR is merged.')

  title = f'Merge {SOURCE_BRANCH} into {TARGET_BRANCH}'

  # Create the pull request
  # PR checks won't be triggered on PRs created by Actions. Therefore mark the PR as draft so that
  # a maintainer can take the PR out of draft, thereby triggering the PR checks.
  pr = repo.create_pull(title=title, body='\n'.join(body), head=new_branch_name, base=TARGET_BRANCH, draft=True)
  print(f'Created PR #{pr.number}')

  # Assign the conductor
  pr.add_to_assignees(conductor)
  print(f'Assigned PR to {conductor}')

# Gets a list of the SHAs of all commits that have happened on the source branch
# since the last release to the target branch.
# This will not include any commits that exist on the target branch
# that aren't on the source branch.
def get_commit_difference(repo):
  # Passing split nothing means that the empty string splits to nothing: compare `''.split() == []`
  # to `''.split('\n') == ['']`.
  commits = run_git('log', '--pretty=format:%H', f'{ORIGIN}/{TARGET_BRANCH}..{ORIGIN}/{SOURCE_BRANCH}').strip().split()

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

  newContent = content.replace('[UNRELEASED]', f'${version} - {get_today_string()}', 1)

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
    '--conductor',
    type=str,
    required=True,
    help='The GitHub handle of the person who is conducting the release process.'
  )

  args = parser.parse_args()

  repo = Github(args.github_token).get_repo(args.repository_nwo)
  version = get_current_version()

  # Print what we intend to go
  print(f'Considering difference between {SOURCE_BRANCH} and {TARGET_BRANCH}...')
  source_branch_short_sha = run_git('rev-parse', '--short', f'{ORIGIN}/{SOURCE_BRANCH}').strip()
  print(f'Current head of {SOURCE_BRANCH} is {source_branch_short_sha}.')

  # See if there are any commits to merge in
  commits = get_commit_difference(repo=repo)
  if len(commits) == 0:
    print(f'No commits to merge from {SOURCE_BRANCH} to {TARGET_BRANCH}.')
    return

  # The branch name is based off of the name of branch being merged into
  # and the SHA of the branch being merged from. Thus if the branch already
  # exists we can assume we don't need to recreate it.
  new_branch_name = f'update-v{version}-{source_branch_short_sha}'
  print(f'Branch name is {new_branch_name}.')

  # Check if the branch already exists. If so we can abort as this script
  # has already run on this combination of branches.
  if branch_exists_on_remote(new_branch_name):
    print(f'Branch {new_branch_name} already exists. Nothing to do.')
    return

  # Create the new branch and push it to the remote
  print(f'Creating branch {new_branch_name}.')

  # If we're performing a standard release, there won't be any new commits on the target branch,
  # as these will have already been merged back into the source branch. Therefore we can just
  # start from the source branch.
  run_git('checkout', '-b', new_branch_name, f'{ORIGIN}/{SOURCE_BRANCH}')

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
    conductor=args.conductor,
  )

if __name__ == '__main__':
  main()
