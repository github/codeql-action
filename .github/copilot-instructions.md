# CodeQL Action - Copilot Instructions

The CodeQL Action is used in GitHub Actions workflows to run CodeQL scans using the CodeQL CLI.

## Overview

- The repository contains two TypeScript projects.
- The main TypeScript codebase is in the `src` directory, with accompanying unit tests in `.test.ts` files in the same directory.
- The main codebase is compiled to bundled JavaScript code, which is also contained in the repository in the `lib` directory.
- A secondary TypeScript codebase with scripts that are only used for development purposes or by CI is in the `pr-checks` directory. This codebase is not compiled to bundled JavaScript. It is executed directly with `tsx`, which handles compilation internally.

## Review instructions

- When wording review comments, be helpful and friendly. Assume that the PR author has written the code with the best of intentions. Word your comments constructively as suggestions for improvements. Do not word suggestions as commands.
- If you want to comment on a change that you believe will fail a CI check, do not present the CI failure you expect as a fact. Instead, write that you think a change "may" lead to a failure in CI. Suggest that, if such a failure manifests, the changes you are commenting on may be the place responsible for the failure and are worth looking at.
- If a suggestion you make is suitable for a follow-up, mention that it can be addressed in a later PR rather than blocking this one.
- If a change is a net improvement, for example because it improves on an existing limitation of existing code, do not complain about remaining limitations that were already present before the change. You can comment on it, but you should make it clear that the thing you are commenting on is not new by writing e.g. "Not new in this PR, but [..]" followed by your description of the issue and a suggestion that it could be improved at the same time with e.g. "Consider whether this is worth addressing as part of this PR as well."

## Generated code

The CodeQL Action is written in TypeScript and compiled to JavaScript. Both the TypeScript sources and the **generated** JavaScript code are contained in this repository. The TypeScript sources are contained in the `src` directory and the JavaScript code is contained in the `lib` directory. A GitHub Actions workflow checks that the JavaScript code in `lib` is up-to-date. Therefore, you should not review any changes to the contents of the `lib` folder and it is expected that the JavaScript code in `lib` closely mirrors the TypeScript code it is generated from. The TypeScript sources in the `pr-checks` directory are not compiled.

GitHub Actions workflows in the `.github/workflows` directory whose filenames start with two underscores (e.g. `__all-platform-bundle.yml`) are automatically generated using the `pr-checks/sync.sh` script from template files in the `pr-checks/checks` directory. Therefore, you do not need to review files in the `.github/workflows` directory that start with two underscores. However, you should review changes to the `pr-checks` directory as well as workflows in the `.github/workflows` directory that do not start with underscores.

## Release process

Changes that are merged to `main` are not used in production straight away. Instead, changes from `main` must first be released using the release process, which has to be manually triggered by a member of staff. Therefore, it is possible for further changes to be made to the code after some changes have been merged to `main` but before they are released. Once the release process automation is started, a series of PRs are automatically generated:

- A release-PR is a PR which matches all of the following patterns:

  - PR title starts with the exact prefix: `Merge main into releases/v`
    - Equivalent regex: `^Merge main into releases\/v`
  - AND head (source) branch matches the update-branch pattern:
    - Regex: `^update-v[0-9]+(?:\.[0-9]+)*(?:-[a-f0-9]+)?` (e.g. `update-v3.29.9-cc722e476`)
  - AND base (target) branch matches a release branch:
    - Regex: `^releases\/v` (e.g. `releases/v3`)

- Consider all files in release-PRs to have already been reviewed and do not review them, except for the following two files:
  - `CHANGELOG.md`
  - `package.json`
