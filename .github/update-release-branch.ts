#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getOctokit } from '@actions/github';

const EMPTY_CHANGELOG = `# CodeQL Action Changelog

## [UNRELEASED]

No user facing changes.

`;

// NB: This exact commit message is used to find commits for reverting during backports.
// Changing it requires a transition period where both old and new versions are supported.
const BACKPORT_COMMIT_MESSAGE = 'Update version and changelog for v';

// Name of the remote
const ORIGIN = 'origin';

interface Args {
  githubToken: string;
  repositoryNwo: string;
  sourceBranch: string;
  targetBranch: string;
  isPrimaryRelease: boolean;
  conductor: string;
}

// Runs git with the given args and returns the stdout.
// Raises an error if git does not exit successfully (unless passed allowNonZeroExitCode=true).
function runGit(args: string[], allowNonZeroExitCode = false): string {
  const cmd = ['git', ...args];
  try {
    return execSync(cmd.join(' '), { encoding: 'utf8' });
  } catch (error: any) {
    if (!allowNonZeroExitCode) {
      throw new Error(`Call to ${cmd.join(' ')} exited with code ${error.status} stderr: ${error.stderr}`);
    }
    return '';
  }
}

// Returns true if the given branch exists on the origin remote
function branchExistsOnRemote(branchName: string): boolean {
  return runGit(['ls-remote', '--heads', ORIGIN, branchName]).trim() !== '';
}

// Gets a list of the SHAs of all commits that have happened on the source branch
// since the last release to the target branch.
// This will not include any commits that exist on the target branch
// that aren't on the source branch.
function getCommitDifference(sourceBranch: string, targetBranch: string): string[] {
  const commits = runGit(['log', '--pretty=format:%H', `${ORIGIN}/${targetBranch}..${ORIGIN}/${sourceBranch}`])
    .trim()
    .split('\n')
    .filter(sha => sha.length > 0);
  return commits;
}

// Gets a copy of the commit message that should display nicely
function getTruncatedCommitMessage(message: string): string {
  const firstLine = message.split('\n')[0];
  if (firstLine.length > 60) {
    return `${firstLine.substring(0, 57)}...`;
  }
  return firstLine;
}

function getCurrentVersion(): string {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

// `npm version` doesn't always work because of merge conflicts, so we
// replace the version in package.json textually.
function replaceVersionPackageJson(prevVersion: string, newVersion: string): void {
  const content = fs.readFileSync('package.json', 'utf8');
  const lines = content.split('\n');
  let prevLineIsCodeql = false;
  
  for (let i = 0; i < lines.length; i++) {
    if (prevLineIsCodeql && lines[i].includes(`"version": "${prevVersion}"`)) {
      lines[i] = lines[i].replace(prevVersion, newVersion);
    }
    prevLineIsCodeql = lines[i].includes('"name": "codeql",');
  }
  
  fs.writeFileSync('package.json', lines.join('\n'));
}

function getTodayString(): string {
  const today = new Date();
  return today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function processChangelogForBackports(sourceBranchMajorVersion: string, targetBranchMajorVersion: string): void {
  // changelog entries can use the following format to indicate
  // that they only apply to newer versions
  const someVersionsOnlyRegex = /\[v(\d+)\+ only\]/;

  let output = '';
  const content = fs.readFileSync('CHANGELOG.md', 'utf8');
  const lines = content.split('\n');
  let lineIndex = 0;

  // until we find the first section, just duplicate all lines
  let foundFirstSection = false;
  while (!foundFirstSection && lineIndex < lines.length) {
    let line = lines[lineIndex];
    lineIndex++;

    if (line.startsWith('## ')) {
      line = line.replace(`## ${sourceBranchMajorVersion}`, `## ${targetBranchMajorVersion}`);
      foundFirstSection = true;
    }

    output += line + '\n';
  }

  if (!foundFirstSection) {
    throw new Error('Could not find any change sections in CHANGELOG.md');
  }

  // found_content tracks whether we hit two headings in a row
  let foundContent = false;
  output += '\n';
  
  while (lineIndex < lines.length) {
    let line = lines[lineIndex];
    lineIndex++;

    // filter out changenote entries that apply only to newer versions
    const match = someVersionsOnlyRegex.exec(line);
    if (match) {
      if (parseInt(targetBranchMajorVersion, 10) < parseInt(match[1], 10)) {
        continue;
      }
    }

    if (line.startsWith('## ')) {
      line = line.replace(`## ${sourceBranchMajorVersion}`, `## ${targetBranchMajorVersion}`);
      if (!foundContent) {
        // we have found two headings in a row, so we need to add the placeholder message.
        output += 'No user facing changes.\n';
      }
      foundContent = false;
      output += `\n${line}\n\n`;
    } else {
      if (line.trim() !== '') {
        foundContent = true;
        output += line + '\n';
      }
    }
  }

  fs.writeFileSync('CHANGELOG.md', output);
}

function updateChangelog(version: string): void {
  let content = EMPTY_CHANGELOG;
  
  if (fs.existsSync('CHANGELOG.md')) {
    content = fs.readFileSync('CHANGELOG.md', 'utf8');
  }

  const newContent = content.replace('[UNRELEASED]', `${version} - ${getTodayString()}`);
  fs.writeFileSync('CHANGELOG.md', newContent);
}

// Opens a PR from the given branch to the target branch
async function openPr(
  octokit: ReturnType<typeof getOctokit>,
  repositoryNwo: string,
  commits: string[],
  sourceBranchShortSha: string,
  newBranchName: string,
  sourceBranch: string,
  targetBranch: string,
  conductor: string,
  isPrimaryRelease: boolean,
  conflictedFiles: string[]
): Promise<void> {
  const [owner, repo] = repositoryNwo.split('/');

  // Start constructing the body text
  const body: string[] = [];
  body.push(`Merging ${sourceBranchShortSha} into \`${targetBranch}\`.`);
  body.push('');
  body.push(`Conductor for this PR is @${conductor}.`);

  // For this simplified version, we'll include basic commit info
  if (commits.length > 0) {
    body.push('');
    body.push(`Contains ${commits.length} commits.`);
  }

  body.push('');
  body.push('Please do the following:');
  if (conflictedFiles.length > 0) {
    body.push(' - [ ] Ensure `package.json` file contains the correct version.');
    body.push(' - [ ] Add commits to this branch to resolve the merge conflicts in the following files:');
    conflictedFiles.forEach(file => {
      body.push(`    - [ ] \`${file}\``);
    });
    body.push(' - [ ] Ensure another maintainer has reviewed the additional commits you added to this branch to resolve the merge conflicts.');
  }
  body.push(' - [ ] Ensure the CHANGELOG displays the correct version and date.');
  body.push(' - [ ] Ensure the CHANGELOG includes all relevant, user-facing changes since the last release.');
  body.push(` - [ ] Check that there are not any unexpected commits being merged into the \`${targetBranch}\` branch.`);
  body.push(' - [ ] Ensure the docs team is aware of any documentation changes that need to be released.');

  if (!isPrimaryRelease) {
    body.push(' - [ ] Remove and re-add the "Rebuild" label to the PR to trigger just this workflow.');
    body.push(' - [ ] Wait for the "Rebuild" workflow to push a commit updating the distribution files.');
  }

  body.push(' - [ ] Mark the PR as ready for review to trigger the full set of PR checks.');
  body.push(' - [ ] Approve and merge this PR. Make sure `Create a merge commit` is selected rather than `Squash and merge` or `Rebase and merge`.');

  if (isPrimaryRelease) {
    body.push(' - [ ] Merge the mergeback PR that will automatically be created once this PR is merged.');
    body.push(' - [ ] Merge all backport PRs to older release branches, that will automatically be created once this PR is merged.');
  }

  const title = `Merge ${sourceBranch} into ${targetBranch}`;
  const labels = isPrimaryRelease ? [] : ['Rebuild'];

  // Create the pull request
  // PR checks won't be triggered on PRs created by Actions. Therefore mark the PR as draft so that
  // a maintainer can take the PR out of draft, thereby triggering the PR checks.
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body: body.join('\n'),
    head: newBranchName,
    base: targetBranch,
    draft: true
  });

  if (labels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pr.data.number,
      labels
    });
  }

  console.log(`Created PR #${pr.data.number}`);

  // Assign the conductor
  await octokit.rest.issues.addAssignees({
    owner,
    repo,
    issue_number: pr.data.number,
    assignees: [conductor]
  });
  
  console.log(`Assigned PR to ${conductor}`);
}

function parseArgs(): Args {
  const args: Args = {
    githubToken: '',
    repositoryNwo: '',
    sourceBranch: '',
    targetBranch: '',
    isPrimaryRelease: false,
    conductor: ''
  };

  for (let i = 2; i < process.argv.length; i++) {
    switch (process.argv[i]) {
      case '--github-token':
        args.githubToken = process.argv[++i];
        break;
      case '--repository-nwo':
        args.repositoryNwo = process.argv[++i];
        break;
      case '--source-branch':
        args.sourceBranch = process.argv[++i];
        break;
      case '--target-branch':
        args.targetBranch = process.argv[++i];
        break;
      case '--is-primary-release':
        args.isPrimaryRelease = true;
        break;
      case '--conductor':
        args.conductor = process.argv[++i];
        break;
    }
  }

  if (!args.githubToken || !args.repositoryNwo || !args.sourceBranch || !args.targetBranch || !args.conductor) {
    throw new Error('Missing required arguments');
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  
  const octokit = getOctokit(args.githubToken);

  // the target branch will be of the form releases/vN, where N is the major version number
  const targetBranchMajorVersion = args.targetBranch.replace('releases/v', '');

  // split version into major, minor, patch
  const currentVersion = getCurrentVersion();
  const [, vMinor, vPatch] = currentVersion.split('.');

  const version = `${targetBranchMajorVersion}.${vMinor}.${vPatch}`;

  // Print what we intend to do
  console.log(`Considering difference between ${args.sourceBranch} and ${args.targetBranch}...`);
  const sourceBranchShortSha = runGit(['rev-parse', '--short', `${ORIGIN}/${args.sourceBranch}`]).trim();
  console.log(`Current head of ${args.sourceBranch} is ${sourceBranchShortSha}.`);

  // See if there are any commits to merge in
  const commits = getCommitDifference(args.sourceBranch, args.targetBranch);
  if (commits.length === 0) {
    console.log(`No commits to merge from ${args.sourceBranch} to ${args.targetBranch}.`);
    return;
  }

  // define distinct prefix in order to support specific pr checks on backports
  const branchPrefix = args.isPrimaryRelease ? 'update' : 'backport';

  // The branch name is based off of the name of branch being merged into
  // and the SHA of the branch being merged from. Thus if the branch already
  // exists we can assume we don't need to recreate it.
  const newBranchName = `${branchPrefix}-v${version}-${sourceBranchShortSha}`;
  console.log(`Branch name is ${newBranchName}.`);

  // Check if the branch already exists. If so we can abort as this script
  // has already run on this combination of branches.
  if (branchExistsOnRemote(newBranchName)) {
    console.log(`Branch ${newBranchName} already exists. Nothing to do.`);
    return;
  }

  // Create the new branch and push it to the remote
  console.log(`Creating branch ${newBranchName}.`);

  // The process of creating the v{Older} release can run into merge conflicts. We commit the unresolved
  // conflicts so a maintainer can easily resolve them (vs erroring and requiring maintainers to
  // reconstruct the release manually)
  let conflictedFiles: string[] = [];

  if (!args.isPrimaryRelease) {
    // the source branch will be of the form releases/vN, where N is the major version number
    const sourceBranchMajorVersion = args.sourceBranch.replace('releases/v', '');

    // If we're performing a backport, start from the target branch
    console.log(`Creating ${newBranchName} from the ${ORIGIN}/${args.targetBranch} branch`);
    runGit(['checkout', '-b', newBranchName, `${ORIGIN}/${args.targetBranch}`]);

    // Revert the commit that we made as part of the last release that updated the version number and
    // changelog to refer to {older}.x.x variants. This avoids merge conflicts in the changelog and
    // package.json files when we merge in the v{latest} branch.
    console.log('Reverting the version number and changelog updates from the last release to avoid conflicts');
    const vOlderUpdateCommits = runGit(['log', '--grep', `^${BACKPORT_COMMIT_MESSAGE}`, '--format=%H']).split('\n').filter(sha => sha.trim());

    if (vOlderUpdateCommits.length > 0) {
      console.log(`  Reverting ${vOlderUpdateCommits[0]}`);
      // Only revert the newest commit as older ones will already have been reverted in previous releases.
      runGit(['revert', vOlderUpdateCommits[0], '--no-edit']);

      // Also revert the "Update checked-in dependencies" commit created by Actions.
      const updateDependenciesCommit = runGit(['log', '--grep', '^Update checked-in dependencies', '--format=%H']).split('\n')[0];
      if (updateDependenciesCommit) {
        console.log(`  Reverting ${updateDependenciesCommit}`);
        runGit(['revert', updateDependenciesCommit, '--no-edit']);
      }
    } else {
      console.log('  Nothing to revert.');
    }

    console.log(`Merging ${ORIGIN}/${args.sourceBranch} into the release prep branch`);
    // Commit any conflicts (see the comment for `conflictedFiles`)
    runGit(['merge', `${ORIGIN}/${args.sourceBranch}`], true);
    conflictedFiles = runGit(['diff', '--name-only', '--diff-filter', 'U']).split('\n').filter(f => f.trim());
    if (conflictedFiles.length > 0) {
      runGit(['add', '.']);
      runGit(['commit', '--no-edit']);
    }

    // Migrate the package version number from a vLatest version number to a vOlder version number
    console.log(`Setting version number to ${version} in package.json`);
    replaceVersionPackageJson(getCurrentVersion(), version); // We rely on the `Rebuild` workflow to update package-lock.json
    runGit(['add', 'package.json']);

    // Migrate the changelog notes from vLatest version numbers to vOlder version numbers
    console.log(`Migrating changelog notes from v${sourceBranchMajorVersion} to v${targetBranchMajorVersion}`);
    processChangelogForBackports(sourceBranchMajorVersion, targetBranchMajorVersion);

    // Amend the commit generated by `npm version` to update the CHANGELOG
    runGit(['add', 'CHANGELOG.md']);
    runGit(['commit', '-m', `${BACKPORT_COMMIT_MESSAGE}${version}`]);
  } else {
    // If we're performing a standard release, there won't be any new commits on the target branch,
    // as these will have already been merged back into the source branch. Therefore we can just
    // start from the source branch.
    runGit(['checkout', '-b', newBranchName, `${ORIGIN}/${args.sourceBranch}`]);

    console.log('Updating changelog');
    updateChangelog(version);

    // Create a commit that updates the CHANGELOG
    runGit(['add', 'CHANGELOG.md']);
    runGit(['commit', '-m', `Update changelog for v${version}`]);
  }

  runGit(['push', ORIGIN, newBranchName]);

  // Open a PR to update the branch
  await openPr(
    octokit,
    args.repositoryNwo,
    commits,
    sourceBranchShortSha,
    newBranchName,
    args.sourceBranch,
    args.targetBranch,
    args.conductor,
    args.isPrimaryRelease,
    conflictedFiles
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}