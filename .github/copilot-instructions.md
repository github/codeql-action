# CodeQL Action - Copilot Instructions

## Generated code

The CodeQL Action is written in TypeScript and compiled to JavaScript. Both the TypeScript sources and the **generated** JavaScript code are contained in this repository. The TypeScript sources are contained in the `src` directory and the JavaScript code is contained in the `lib` directory. A GitHub Actions workflow checks that the JavaScript code in `lib` is up-to-date. Therefore, you should not review any changes to the contents of the `lib` folder and it is expected that the JavaScript code in `lib` closely mirrors the TypeScript code it is generated from.

GitHub Actions workflows in the `.github/workflows` directory whose filenames start with two underscores (e.g. `__all-platform-bundle.yml`) are automatically generated using the `pr-checks/sync.sh` script from template files in the `pr-checks/checks` directory. Therefore, you do not need to review files in the `.github/workflows` directory that starts with two underscores. However, you should review changes to the `pr-checks` directory as well as workflows in the `.github/workflows` directory that do not start with underscores.

## Release process

- Do not review PRs that match any of the following release-PR patterns:
  - PR title starts with the exact prefix: `Merge main into releases/v`
    - Equivalent regex: `^Merge main into releases\/v`
  - OR head (source) branch matches the update-branch pattern:
    - Regex: `^update-v[0-9]+(?:\.[0-9]+)*(?:-[a-f0-9]+)?` (e.g. `update-v3.29.9-cc722e476`)
  - OR base (target) branch matches a release branch:
    - Regex: `^releases\/v` (e.g. `releases/v3`)

- In PRs that match the release-PR patterns above:
  - Review only the following files:
    - `CHANGELOG.md`
    - `package.json`
  - Do not review other files in those PRs (these are considered mechanically generated updates).

- If a PR matches the release-PR patterns but includes changes outside the two files above, do not attempt a full review of the generated changes — treat non-`CHANGELOG.md`/`package.json` edits as not requiring review.
