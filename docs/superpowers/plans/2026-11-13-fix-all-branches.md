# Fix All Branches and Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all syntax errors, duplicate keys, broken GitHub Actions workflows, and corrupted package-lock files across `main` and all active branches of `beer-sakthai/codeql-action`.

**Architecture:** 
1. Fix `package.json` duplicate dependency keys and regenerate a valid `package-lock.json` on `main`.
2. Fix YAML syntax error in `.github/workflows/codeql.yml` on `main`.
3. Fix duplicate keys in `pr-checks/checks/*.yml` and re-sync generated `.github/workflows/__*.yml` workflows on `main`.
4. Rebase/merge the fixed `main` into `dependabot/npm_and_yarn/actions/core-3.0.1` (PR #13) so its dependencies, `package.json`, and `package-lock.json` are clean and valid.
5. Push fixes to `main` and `dependabot/npm_and_yarn/actions/core-3.0.1`.

**Tech Stack:** Node.js / npm, TypeScript, GitHub Actions, YAML, Git.

---

### Global Constraints
- All YAML files in `.github/workflows/` and `pr-checks/checks/` must parse cleanly with zero duplicate keys and zero syntax errors.
- `package.json` and `package-lock.json` must be strictly valid JSON with zero duplicate keys.
- Do not introduce breaking changes to existing action interfaces.

---

### Task 1: Fix `package.json` and regenerate `package-lock.json` on `main`
- [ ] Remove duplicate keys in `package.json`:
  - Keep `@actions/glob: ^0.5.0`
  - Keep `@actions/http-client: ^4.0.1`
  - Keep `@types/sinon: ^22.0.2`
  - Keep `ava: ^6.4.1`
- [ ] Rebuild clean `package-lock.json` using `npm install --package-lock-only` (or clean install).
- [ ] Run validator script to ensure `package.json` and `package-lock.json` are valid JSON with 0 duplicate keys.
- [ ] Commit changes to `main`.

### Task 2: Fix syntax error in `.github/workflows/codeql.yml` on `main`
- [ ] In `analyze-javascript` step of `.github/workflows/codeql.yml`, remove the duplicate indented `- name: Checkout` block inside `upload:`.
- [ ] In `analyze-other` step of `.github/workflows/codeql.yml`, remove the duplicate indented `- name: Checkout` block inside `upload:`.
- [ ] Validate `.github/workflows/codeql.yml` using `yaml.safe_load`.
- [ ] Commit changes to `main`.

### Task 3: Fix duplicate keys in `pr-checks/checks/*.yml` and sync workflows on `main`
- [ ] Remove duplicate `runner-image: macos-26-xlarge` in:
  - `pr-checks/checks/swift-autobuild.yml`
  - `pr-checks/checks/swift-custom-build.yml`
  - `pr-checks/checks/all-platform-bundle.yml`
  - `pr-checks/checks/multi-language-autodetect.yml`
  (Keep `runner-image: macos-latest`)
- [ ] In `pr-checks/checks/per-language-bundle-validation.yml`, fix duplicate `os` and `version` entries under `language: swift` (use `os: macos-latest` and `version: linked`, `build-mode: autobuild`).
- [ ] Run `npx tsx pr-checks/sync.ts` to regenerate `.github/workflows/__*.yml`.
- [ ] Run the repository-wide YAML validator to verify 0 syntax errors and 0 duplicate keys across all YAML files.
- [ ] Commit changes to `main`.

### Task 4: Fix PR #13 branch (`dependabot/npm_and_yarn/actions/core-3.0.1`)
- [ ] Checkout branch `dependabot/npm_and_yarn/actions/core-3.0.1`.
- [ ] Merge or rebase onto updated `main`.
- [ ] Verify that `@actions/core: ^3.0.1` is set cleanly in both `package.json` and `pr-checks/package.json` without duplicate keys.
- [ ] Regenerate `package-lock.json` cleanly so it contains valid JSON.
- [ ] Verify all YAML files and JSON files on this branch have 0 errors.
- [ ] Commit changes to `dependabot/npm_and_yarn/actions/core-3.0.1`.

### Task 5: Final whole-branch audit, verification and push
- [ ] Audit all 7 branches to confirm their status.
- [ ] Push updated `main` to `origin/main`.
- [ ] Push updated `dependabot/npm_and_yarn/actions/core-3.0.1` to `origin/dependabot/npm_and_yarn/actions/core-3.0.1`.
- [ ] Verify that GitHub Actions trigger cleanly on the pushed branches.
