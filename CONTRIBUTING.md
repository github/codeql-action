# Contributing

[fork]: https://github.com/github/codeql-action/fork
[pr]: https://github.com/github/codeql-action/compare
[code-of-conduct]: CODE_OF_CONDUCT.md

Hi there! We're thrilled that you'd like to contribute to this project. Your help is essential for keeping it great.

Contributions to this project are [released](https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license) to the public under the [project's open source license](LICENSE).

Please note that this project is released with a [Contributor Code of Conduct][code-of-conduct]. By participating in this project you agree to abide by its terms.

## Development and Testing

Before you start, ensure that you have a recent version of node installed. You can see which version of node is used by the action in `init/action.yml`.

### Common tasks

* Transpile the TypeScript to JavaScript: `npm run build`.  Note that the JavaScript files are committed to git.
* Run tests: `npm run test`.  You’ll need to ensure that the JavaScript files are up-to-date first by running the command above.
* Run the linter: `npm run lint`.

This project also includes configuration to run tests from VSCode (with support for breakpoints) - open the test file you wish to run and choose "Debug AVA test file" from the Run menu in the Run panel.

You may want to run `tsc --watch` from the command line or inside of vscode in order to ensure build artifacts are up to date as you are working.

### Checking in compiled artifacts and `node_modules`

Because CodeQL Action users consume the code directly from this repository, and there can be no build step during an GitHub Actions run, this repository contains all compiled artifacts and node modules. There is a PR check that will fail if any of the compiled artifacts are not up to date. Compiled artifacts are stored in the `lib/` directory. For all day-to-day development purposes, this folder can be ignored.

Only run `npm install` if you are explicitly changing the set of dependencies in `package.json`. The `node_modules` directory should be up to date when you check out, but if for some reason, there is an inconsistency use `npm ci && npm run removeNPMAbsolutePaths` to ensure the directory is in a state consistent with the `package-lock.json`. There is a PR check to ensure the consistency of the `node_modules` directory.

### Running the action

To see the effect of your changes and to test them, push your changes in a branch and then look at the [Actions output](https://github.com/github/codeql-action/actions) for that branch.  You can also exercise the code locally by running the automated tests.

### Running the action locally

It is possible to run this action locally via [act](https://github.com/nektos/act) via the following steps:

1. Create a GitHub [Personal Access Token](https://github.com/settings/tokens) (PAT).
1. Install [act](https://github.com/nektos/act) v0.2.10 or greater.
1. Add a `.env` file in the root of the project you are running:

  ```bash
  CODEQL_LOCAL_RUN=true
  GITHUB_SERVER_URL=https://github.com

  # Optional, for better logging
  GITHUB_JOB=<ANY_JOB_NAME>
  ```

1. Run `act -j codeql -s GITHUB_TOKEN=<PAT>`

Running locally will generate the CodeQL database and run all the queries, but it will avoid uploading and reporting results to GitHub. Note that this must be done on a repository that _consumes_ this action, not this repository. The use case is to debug failures of this action on specific repositories.

### Integration tests

As well as the unit tests (see _Common tasks_ above), there are integration tests, defined in `.github/workflows/integration-testing.yml`.  These are run by a CI check.  Depending on the change you’re making, you may want to add a test to this file or extend an existing one.

### Building the CodeQL runner

Navigate to the `runner` directory and run `npm install` to install dependencies needed only for compiling the CodeQL runner. Run `npm run build-runner` to output files to the `runner/dist` directory.

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

## Resources

- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
- [Using Pull Requests](https://help.github.com/articles/about-pull-requests/)
- [GitHub Help](https://help.github.com)
