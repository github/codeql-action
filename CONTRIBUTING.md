# Contributing

[fork]: https://github.com/github/codeql-action/fork
[pr]: https://github.com/github/codeql-action/compare
[code-of-conduct]: CODE_OF_CONDUCT.md
[readme]: README.md#supported-versions-of-the-codeql-cli-and-github-enterprise-server

Hi there! We're thrilled that you'd like to contribute to this project. Your help is essential for keeping it great.

Contributions to this project are [released](https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license) to the public under the [project's open source license](LICENSE).

Please note that this project is released with a [Contributor Code of Conduct][code-of-conduct]. By participating in this project you agree to abide by its terms.

## Development and Testing

Before you start, ensure that you have a recent version of node (16 or higher) installed, along with a recent version of npm (9.2 or higher). You can see which version of node is used by the action in `init/action.yml`.

### Common tasks

* Transpile the TypeScript to JavaScript: `npm run build`.  Note that the JavaScript files are committed to git.
* Run tests: `npm run test`.  You’ll need to ensure that the JavaScript files are up-to-date first by running the command above.
* Run the linter: `npm run lint`.

This project also includes configuration to run tests from VSCode (with support for breakpoints) - open the test file you wish to run and choose "Debug AVA test file" from the Run menu in the Run panel.

You may want to run `tsc --watch` from the command line or inside of vscode in order to ensure build artifacts are up to date as you are working.

### Checking in compiled artifacts and `node_modules`

Because CodeQL Action users consume the code directly from this repository, and there can be no build step during a GitHub Actions run, this repository contains all compiled artifacts and node modules. There is a PR check that will fail if any of the compiled artifacts are not up to date. Compiled artifacts are stored in the `lib/` directory. For all day-to-day development purposes, this folder can be ignored.

Only run `npm install` if you are explicitly changing the set of dependencies in `package.json`. The `node_modules` directory should be up to date when you check out, but if for some reason, there is an inconsistency use `npm ci && npm run removeNPMAbsolutePaths` to ensure the directory is in a state consistent with the `package-lock.json`. Note that due to a macOS-specific dependency, this command should be run on a macOS machine. There is a PR check to ensure the consistency of the `node_modules` directory.

### Running the action

To see the effect of your changes and to test them, push your changes in a branch and then look at the [Actions output](https://github.com/github/codeql-action/actions) for that branch.  You can also exercise the code locally by running the automated tests.

### Integration tests

As well as the unit tests (see _Common tasks_ above), there are integration tests, defined in `.github/workflows/integration-testing.yml`.  These are run by a CI check.  Depending on the change you’re making, you may want to add a test to this file or extend an existing one.

## Submitting a pull request

1. [Fork][fork] and clone the repository
2. Create a new branch: `git checkout -b my-branch-name`
3. Make your change, add tests, and make sure the tests still pass
4. Push to your fork and [submit a pull request][pr]
5. Pat yourself on the back and wait for your pull request to be reviewed and merged.

If you're a GitHub staff member, you can merge your own PR once it's approved; for external contributors, GitHub staff will merge your PR once it's approved.

Here are a few things you can do that will increase the likelihood of your pull request being accepted:

- Write tests.
- Keep your change as focused as possible. If there are multiple changes you would like to make that are not dependent upon each other, consider submitting them as separate pull requests.
- Write a [good commit message](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html).

## Releasing (write access required)

1. The first step of releasing a new version of the `codeql-action` is running the "Update release branch" workflow.
    This workflow goes through the pull requests that have been merged to `main` since the last release, creates a changelog, then opens a pull request to merge the changes since the last release into the `releases/v3` release branch.

    You can start a release by triggering this workflow via [workflow dispatch](https://github.com/github/codeql-action/actions/workflows/update-release-branch.yml).
1. The workflow run will open a pull request titled "Merge main into releases/v3". Follow the steps on the checklist in the pull request. Once you've checked off all but the last two of these, approve the PR and automerge it.
1. When the "Merge main into releases/v3" pull request is merged into the `releases/v3` branch, a mergeback pull request to `main` will be automatically created. This mergeback pull request incorporates the changelog updates into `main`, tags the release using the merge commit of the "Merge main into releases/v3" pull request, and bumps the patch version of the CodeQL Action. 
1. If a backport to an older major version is required, a pull request targeting that version's branch will also be automatically created.
1. Approve the mergeback and backport pull request (if applicable) and automerge them.

Once the mergeback and backport pull request have been merged, the release is complete.

## Keeping the PR checks up to date (admin access required)

Since the `codeql-action` runs most of its testing through individual Actions workflows, there are over two hundred jobs that need to pass in order for a PR to turn green. You can regenerate the checks automatically by running the [update-required-checks.sh](.github/workflows/script/update-required-checks.sh) script:

1. By default, this script retrieves the checks from the latest SHA on `main`, so make sure that your `main` branch is up to date.
2. Run the script. If there's a reason to, you can pass in a different SHA as a CLI argument.
3. After running, go to the [branch protection rules settings page](https://github.com/github/codeql-action/settings/branches) and validate that the rules for `main`, `v3`, and any other currently supported major versions have been updated.

Note that any updates to checks on `main` need to be backported to all currently supported major version branches, in order to maintain the same set of names for required checks.

## Deprecating a CodeQL version (write access required)

We typically deprecate a version of CodeQL when the GitHub Enterprise Server (GHES) version that it first shipped in is deprecated.

1. Work out the next minimum version of CodeQL. This is the version that shipped in the version of GHES after the one that has just been deprecated.
1. Notify users using the old version of CodeQL about the deprecation.
    - Update `CODEQL_NEXT_MINIMUM_VERSION`, `GHES_VERSION_MOST_RECENTLY_DEPRECATED`, and `GHES_MOST_RECENT_DEPRECATION_DATE` in `src/codeql.ts` to reflect the new minimum version of CodeQL and the GHES version that has just been deprecated.
    - Add a changelog note announcing the deprecation.
    - Update the CLI version referenced in the [readme] by adding a new row to the compatibility table.
    - Example PR: https://github.com/github/codeql-action/pull/1884
1. Release the Action, or wait for the next scheduled release of the Action, then wait at least a week so users have time to see and act on the deprecation warning.
1. Remove support for the old version of CodeQL.
    - Bump `CODEQL_MINIMUM_VERSION` in `src/codeql.ts` to the new minimum version of CodeQL.
    - Remove any code that is only needed to support the old version of CodeQL. This is often behind a version guard, so look for instances of version numbers between the old minimum version and the new minimum version in the codebase. A good place to start is the list of version numbers in `src/codeql.ts`.
    - Update the default set of CodeQL test versions in `pr-checks/sync.py`.
        - Remove the old minimum version of CodeQL.
        - Add the latest patch release for any new CodeQL minor version series that have shipped in GHES.
        - Run the script to update the generated PR checks.
    - Do the same for PR checks that aren't auto-generated.
    - Add a changelog note announcing the new minimum version of CodeQL that is now required.
    - Example PR: https://github.com/github/codeql-action/pull/1907

## Adding a new CodeQL Action major version

We sometimes maintain multiple versions of the CodeQL Action to enable customers on older but still supported versions of GitHub Enterprise Server (GHES) to continue to benefit from the latest CodeQL improvements. To accomplish this, the release process automation listens to updates to the release branch for the newest supported version.  When this branch is updated, the release process automatically opens backport PRs to update the release branches for older versions.

To add a new major version of the Action:

1. Change the `version` field of `package.json` by running `npm version x.y.z` where `x` is the new major version, and `y` and `z` match the latest minor and patch versions of the last release.
1. Update appropriate documentation to explain the reasoning behind the releases: see [the diff](https://github.com/github/codeql-action/pull/2677/commits/913d60579d4b560addf53ec3c493d491dd3c1378) in our last major version deprecation for examples on which parts of the documentation should be updated.
1. Consider the timeline behind deprecating the prior Action version: see [CodeQL Action deprecation documentation](#deprecating-a-codeql-action-major-version-write-access-required)
1. If the new major version runs on a new version of Node, add a PR check to ensure the codebase continues to compile against the previous version of Node. See [Remove Node 16 compilation PR check](https://github.com/github/codeql-action/pull/2695) for an example.

## Deprecating a CodeQL Action major version (write access required)

We typically deprecate older versions of the Action once all supported GHES versions are compatible with the version of Node.js we are using on `main`.

To deprecate an older version of the Action:

1. Notify any users who are still pinned to the `vN` tag of the deprecated version of the Action, giving as much notice as is practical.
   - Add a changelog note announcing the deprecation.
   - Implement an Actions warning for customers using the deprecated version.
1. Wait for the deprecation period to pass.
1. Upgrade the Actions warning for customers using the deprecated version to a non-fatal error, and mention that this version of the Action is no longer supported.
1. Make a PR to bump the `OLDEST_SUPPORTED_MAJOR_VERSION` in [releases.ini](.github/releases.ini).  Once this PR is merged, the release process will no longer backport changes to the deprecated release version.

## Resources

- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
- [Using Pull Requests](https://help.github.com/articles/about-pull-requests/)
- [GitHub Help](https://help.github.com)
