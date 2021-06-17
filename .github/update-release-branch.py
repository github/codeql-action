import datetime
from github import Github
import random
import requests
import subprocess
import sys
import json
import datetime
import os

EMPTY_CHANGELOG = """# CodeQL Action and CodeQL Runner Changelog

## [UNRELEASED]

"""

# The branch being merged from.
# This is the one that contains day-to-day development work.
MAIN_BRANCH = 'main'
# The branch being merged into.
# This is the release branch that users reference.
LATEST_RELEASE_BRANCH = 'v1'
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

# Opens a PR from the given branch to the release branch
def open_pr(repo, all_commits, short_main_sha, branch_name):
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
  body.append('Merging ' + short_main_sha + ' into ' + LATEST_RELEASE_BRANCH)

  conductor = get_conductor(repo, pull_requests, commits_without_pull_requests)
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
      body.append('- ' + commit.sha + ' - ' + get_truncated_commit_message(commit) + ' (@' + commit.author.login + ')')

  body.append('')
  body.append('Please review the following:')
  body.append(' - [ ] The CHANGELOG displays the correct version and date.')
  body.append(' - [ ] The CHANGELOG includes all relevant, user-facing changes since the last release.')
  body.append(' - [ ] There are no unexpected commits being merged into the ' + LATEST_RELEASE_BRANCH + ' branch.')
  body.append(' - [ ] The docs team is aware of any documentation changes that need to be released.')
  body.append(' - [ ] The mergeback PR is merged back into ' + MAIN_BRANCH + ' after this PR is merged.')

  title = 'Merge ' + MAIN_BRANCH + ' into ' + LATEST_RELEASE_BRANCH

  # Create the pull request
  pr = repo.create_pull(title=title, body='\n'.join(body), head=branch_name, base=LATEST_RELEASE_BRANCH)
  print('Created PR #' + str(pr.number))

  # Assign the conductor
  pr.add_to_assignees(conductor)
  print('Assigned PR to ' + conductor)

# Gets the person who should be in charge of the mergeback PR
def get_conductor(repo, pull_requests, other_commits):
  # If there are any PRs then use whoever merged the last one
  if len(pull_requests) > 0:
    return get_merger_of_pr(repo, pull_requests[-1])

  # Otherwise take the author of the latest commit
  return other_commits[-1].author.login

# Gets a list of the SHAs of all commits that have happened on main
# since the release branched off.
# This will not include any commits that exist on the release branch
# that aren't on main.
def get_commit_difference(repo):
  commits = run_git('log', '--pretty=format:%H', ORIGIN + '/' + LATEST_RELEASE_BRANCH + '..' + ORIGIN + '/' + MAIN_BRANCH).strip().split('\n')

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

# Converts a commit into the PR that introduced it to the main branch.
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
  if len(sys.argv) != 3:
    raise Exception('Usage: update-release.branch.py <github token> <repository nwo>')
  github_token = sys.argv[1]
  repository_nwo = sys.argv[2]

  repo = Github(github_token).get_repo(repository_nwo)
  version = get_current_version()

  # Print what we intend to go
  print('Considering difference between ' + MAIN_BRANCH + ' and ' + LATEST_RELEASE_BRANCH)
  short_main_sha = run_git('rev-parse', '--short', ORIGIN + '/' + MAIN_BRANCH).strip()
  print('Current head of ' + MAIN_BRANCH + ' is ' + short_main_sha)

  # See if there are any commits to merge in
  commits = get_commit_difference(repo)
  if len(commits) == 0:
    print('No commits to merge from ' + MAIN_BRANCH + ' to ' + LATEST_RELEASE_BRANCH)
    return

  # The branch name is based off of the name of branch being merged into
  # and the SHA of the branch being merged from. Thus if the branch already
  # exists we can assume we don't need to recreate it.
  new_branch_name = 'update-v' + version + '-' + short_main_sha
  print('Branch name is ' + new_branch_name)

  # Check if the branch already exists. If so we can abort as this script
  # has already run on this combination of branches.
  if branch_exists_on_remote(new_branch_name):
    print('Branch ' + new_branch_name + ' already exists. Nothing to do.')
    return

  # Create the new branch and push it to the remote
  print('Creating branch ' + new_branch_name)
  run_git('checkout', '-b', new_branch_name, ORIGIN + '/' + MAIN_BRANCH)

  print('Updating changelog')
  update_changelog(version)

  # Create a commit that updates the CHANGELOG
  run_git('add', 'CHANGELOG.md')
  run_git('commit', '-m', version)

  run_git('push', ORIGIN, new_branch_name)

  # Open a PR to update the branch
  open_pr(repo, commits, short_main_sha, new_branch_name)

if __name__ == '__main__':
  main()
