# Fork notes

This is a fork of [`github/codeql-action`](https://github.com/github/codeql-action),
maintained under [`beer-sakthai`](https://github.com/beer-sakthai) alongside the SakThai
family repositories. Upstream's own documentation in [`README.md`](README.md) still
applies in full — this file records only what is specific to the fork.

## Why the fork exists

To stage dependency-advisory remediation against the action's **own** dev-dependency
tree, where a fix is available inside the existing semver ranges and touches only
`package-lock.json`. So far:

- `js-yaml` 4.3.0 → 4.3.1 and 3.15.0 → 3.15.1 (GHSA-5p4m-2wfm-xmqj / CVE-2026-59870)
- `tar` 7.5.20 → 7.5.22 (GHSA-r292-9mhp-454m)

Both are dev-only, so the bundled output under `lib/` is unchanged and needs no rebuild.

## What the fork is *not*

**No workflow in the SakThai repositories references this fork.** They pin **upstream**
`github/codeql-action` by commit SHA:

- [`beer-sakthai/Sak-Family-Agent`](https://github.com/beer-sakthai/Sak-Family-Agent) —
  `codeql.yml`, `bandit.yml`, `ossar.yml`, `scorecard.yml`
- [`beer-sakthai/openenv-rl-training`](https://github.com/beer-sakthai/openenv-rl-training) —
  `codeql.yml`, `ossar.yml`

Repointing any of them at this fork would defeat the SHA-pinning those repos rely on for
Scorecard's Pinned-Dependencies check. Consume upstream; use this fork to prepare patches.

## Related repositories

| Repository | What it is |
|---|---|
| [`github/codeql-action`](https://github.com/github/codeql-action) | Upstream. The source of truth for everything in `README.md` and `CHANGELOG.md`. |
| [`beer-sakthai/Sak-Family-Agent`](https://github.com/beer-sakthai/Sak-Family-Agent) | The Sak family agent runtime — `sakthai` package, six personas, memory, MCP, web API. |
| [`beer-sakthai/openenv-rl-training`](https://github.com/beer-sakthai/openenv-rl-training) | The SFT + GRPO training and evaluation pipeline behind the family's models. |
