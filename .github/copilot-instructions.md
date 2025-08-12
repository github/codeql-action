# CodeQL Action - Copilot Instructions

## Generated code

The CodeQL Action is written in TypeScript and compiled to JavaScript. Both the TypeScript sources and the **generated** JavaScript code are contained in this repository. The TypeScript sources are contained in the `src` directory and the JavaScript code is contained in the `lib` directory. A GitHub Actions workflow checks that the JavaScript code in `lib` is up-to-date. Therefore, you should not review any changes to the contents of the `lib` folder and it is expected that the JavaScript code in `lib` closely mirrors the TypeScript code it is generated from.

GitHub Actions workflows in the `.github/workflows` directory whose filenames start with two underscores (e.g. `__all-platform-bundle.yml`) are automatically generated using the `pr-checks/sync.sh` script from template files in the `pr-checks/checks` directory. Therefore, you do not need to review files in the `.github/workflows` directory that start with two underscores. However, you should review changes to the `pr-checks` directory as well as workflows in the `.github/workflows` directory that do not start with underscores.

## Release process

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
