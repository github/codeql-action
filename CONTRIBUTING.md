# Contributing

[fork]: https://github.com/github/codeql-action/fork
[pr]: https://github.com/github/codeql-action/compare
[code-of-conduct]: CODE_OF_CONDUCT.md

Hi there! We're thrilled that you'd like to contribute to this project. Your help is essential for keeping it great.

Contributions to this project are [released](https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license) to the public under the [project's open source license](LICENSE).

Please note that this project is released with a [Contributor Code of Conduct][code-of-conduct]. By participating in this project you agree to abide by its terms.

## Development and Testing

Before you start, ensure that you have a recent version of node (14 or higher) installed, along with a recent version of npm (7 or higher). You can see which version of node is used by the action in `init/action.yml`.

### Common tasks

* Transpile the TypeScript to JavaScript: `npm run build`.  Note that the JavaScript files are committed to git.
* Run tests: `npm run test`.  You’ll need to ensure that the JavaScript files are up-to-date first by running the command above.
* Run the linter: `npm run lint`.

This project also includes configuration to run tests from VSCode (with support for breakpoints) - open the test file you wish to run and choose "Debug AVA test file" from the Run menu in the Run panel.

You may want to run `tsc --watch` from the command line or inside of vscode in order to ensure build artifacts are up to date as you are working.

### Checking in compiled artifacts and `node_modules`

Because CodeQL Action users consume the code directly from this repository, and there can be no build step during an GitHub Actions run, this repository contains all compiled artifacts and node modules. There is a PR check that will fail if any of the compiled artifacts are not up to date. Compiled artifacts are stored in the `lib/` directory. For all day-to-day development purposes, this folder can be ignored.

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
    This workflow goes through the pull requests that have been merged to `main` since the last release, creates a changelog, then opens a pull request to merge the changes since the last release into the `releases/v2` release branch.

    You can start a release by triggering this workflow via [workflow dispatch](https://github.com/github/codeql-action/actions/workflows/update-release-branch.yml).
1. The workflow run will open a pull request titled "Merge main into releases/v2". Mark the pull request as [ready for review](https://docs.github.com/en/github/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/changing-the-stage-of-a-pull-request#marking-a-pull-request-as-ready-for-review) to trigger the PR checks.
1. Review the checklist items in the pull request description.
    Once you've checked off all but the last two of these, approve the PR and automerge it.
1. When the "Merge main into releases/v2" pull request is merged into the `releases/v2` branch, the "Tag release and merge back" workflow will create a mergeback PR.
    This mergeback incorporates the changelog updates into `main`, tags the release using the merge commit of the "Merge main into releases/v2" pull request, and bumps the patch version of the CodeQL Action.

    Approve the mergeback PR and automerge it.
1. When the "Merge main into releases/v2" pull request is merged into the `releases/v2` branch, the "Update release branch" workflow will create a "Merge releases/v2 into releases/v1" pull request to merge the changes since the last release into the `releases/v1` release branch.
    This ensures we keep both the `releases/v1` and `releases/v2` release branches up to date and fully supported.

    Review the checklist items in the pull request description.
    Once you've checked off all the items, approve the PR and automerge it.
1. Once the mergeback has been merged to `main` and the "Merge releases/v2 into releases/v1" PR has been merged to `releases/v1`, the release is complete.

## Keeping the PR checks up to date (admin access required)

Since the `codeql-action` runs most of its testing through individual Actions workflows, there are over two hundred jobs that need to pass in order for a PR to turn green. You can regenerate the checks automatically by running the [update-required-checks.sh](.github/workflows/script/update-required-checks.sh) script:

1. By default, this script retrieves the checks from the latest SHA on `main`, so make sure that your `main` branch is up to date.
2. Run the script. If there's a reason to, you can pass in a different SHA as a CLI argument.
3. After running, go to the [branch protection rules settings page](https://github.com/github/codeql-action/settings/branches) and validate that the rules for `main`, `v1`, and `v2` have been updated.

## Resources

- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
- [Using Pull Requests](https://help.github.com/articles/about-pull-requests/)
- [GitHub Help](https://help.github.com)
