---
name: codeql-action-maintainer
description: "Maintain, test, audit, and safely integrate changes in beer-sakthai/codeql-action. Use for CodeQL Action TypeScript changes, action bundling, workflow fixtures, dependency advisories, CodeQL/OSSAR checks, release branches, rollback, and security-sensitive pull requests."
---

# CodeQL Action Maintainer

Maintain this repository as a security-sensitive fork/staging area for CodeQL Action work. Treat source, generated bundles, workflow fixtures, dependency metadata, and release automation as separate surfaces with separate verification requirements.

## Start every task

1. Work from the repository root and inspect the current branch, worktree, remotes, recent commits, `README.md`, contribution guidance, and release notes.
2. Determine whether the change affects TypeScript source, generated `dist/` bundles, workflow fixtures, dependency advisories, action metadata, or release/rollback automation.
3. Read the nearest tests and workflow that exercise the changed surface before editing.
4. Inspect package scripts and lockfiles. Use the repository’s pinned Node/npm toolchain rather than guessing versions.
5. Keep a short plan for multi-file or security-sensitive changes.

## Repository surfaces

- `src/`: TypeScript action source and shared utilities.
- `__tests__/`, `pr-checks/`, and related fixtures: unit, integration, and workflow validation.
- `.github/workflows/`: large matrix of PR checks, bundle checks, release preparation, rollback, and security workflows.
- `action.yml`: intentionally a stub in this fork; do not treat it as a normal runtime action entrypoint.
- `dist/` or generated release outputs: update only when the project’s build/release procedure requires it.
- `package.json`, lockfiles, advisory/configuration files, and release manifests: supply-chain-sensitive metadata.

Use [repository-map.md](references/repository-map.md) for command and surface mapping. Use [security-and-release.md](references/security-and-release.md) for dependency, bundle, release, and rollback rules.

## Editing rules

- Preserve security boundaries, permissions, pinned action references, checksums, and secret-handling behavior.
- For dependency remediation, change only the intended dependency tree, regenerate the lockfile with the declared toolchain, and inspect the full dependency diff.
- Do not edit generated bundles by hand. Run the canonical build/package command and review generated output for unintended changes.
- For workflow changes, inspect triggers, permissions, `pull_request` safety, fork handling, artifact retention, and release branch behavior.
- Treat code scanning, SARIF upload, query packs, and release archives as security-sensitive outputs.
- Add or update focused tests for changed behavior. Do not weaken assertions or skip security tests to obtain green CI.
- Never add credentials, downloaded binaries, unreviewed third-party scripts, or generated artifacts without explicit provenance.

## Verification workflow

1. Run `git diff --check` and inspect changed source, lockfiles, generated output, and workflow YAML.
2. Install dependencies with the repository’s declared package-manager lockfile.
3. Run the focused tests first, then the relevant lint, typecheck, bundle/build, and workflow fixture checks from `package.json` and the applicable `.github/workflows/` files.
4. For security changes, run the relevant CodeQL/OSSAR/dependency checks and compare alert or advisory scope before and after the change.
5. If the complete matrix is GitHub-only, report local limitations and wait for required remote checks rather than claiming local equivalence.

## GitHub and release workflow

- Treat `main` and release branches as protected. Use a descriptive branch and pull request; never bypass required checks or force-push shared history.
- Inspect required PR checks with `gh pr view` and merge only when the repository reports a clean merge state with all required checks green or explicitly accepted neutral/skipped checks.
- Before release or rollback changes, verify version/tag inputs, generated release files, provenance, and the intended target branch.
- Delete temporary branches only after merge and after confirming their tips are ancestors of `main`.

## Completion report

Report the source and generated files changed, dependency/advisory impact, local and remote checks, PR and merge commit, release implications, and final remote branch state. Clearly distinguish verified security results from static review observations.
