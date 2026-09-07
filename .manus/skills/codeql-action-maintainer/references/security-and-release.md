# Security and Release Safety

## Dependency remediation

1. Identify the exact vulnerable package and dependency tree.
2. Change the smallest supported version range or override.
3. Regenerate the lockfile with the repository’s declared toolchain.
4. Inspect the complete lockfile and package diff for unrelated upgrades.
5. Run the focused tests, lint/typecheck, dependency review, and security workflows.
6. Record advisory identifiers, affected scope, and residual risk.

Do not claim that changing a development dependency fixes a vulnerability in a published action unless the runtime and release contents have been verified.

## Bundles and generated files

Build generated bundles using the canonical package script. Review file lists, source maps, licenses, and checksums. Never patch `dist/` manually to hide a source or build failure. Ensure the generated output corresponds to the intended source commit and dependency lockfile.

## Workflow safety

Review `permissions`, fork behavior, token use, artifact uploads, release refs, and `pull_request_target` boundaries. Treat downloaded archives, third-party actions, release tags, and SARIF inputs as untrusted until provenance and integrity are established.

## Release and rollback

Before a release or rollback:

- Verify the target branch and version/tag inputs.
- Confirm expected release files and generated bundles.
- Review immutable references, provenance, and artifact checksums.
- Confirm that rollback scope is intentional and does not rewrite shared history.
- Wait for required CI and security checks before merging.
