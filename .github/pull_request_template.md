<!--
    For GitHub staff: Remember that this is a public repository. Do not link to internal resources.
                      If necessary, link to this PR from an internal issue and include further details there.

    Everyone: Include a summary of the context of this change, what it aims to accomplish, and why you
              chose the approach you did if applicable. Indicate any open questions you want to answer
              during the review process and anything you want reviewers to pay particular attention to.

    See https://github.com/github/codeql-action/blob/main/CONTRIBUTING.md for additional information.
-->

### Risk assessment

For internal use only. Please select the risk level of this change:

- **Low risk:** Changes are fully under feature flags, or have been fully tested and validated in pre-production environments and are highly observable, or are documentation or test only.
- **High risk:** Changes are not fully under feature flags, have limited visibility and/or cannot be tested outside of production.

#### Which use cases does this change impact?

<!-- Delete options that don't apply. If in doubt, do not delete an option. -->

Workflow types:

- **Advanced setup** - Impacts users who have custom CodeQL workflows.
- **Managed** - Impacts users with `dynamic` workflows (Default Setup, CCR, ...).

Products:

- **Code Scanning** - The changes impact analyses when `analysis-kinds: code-scanning`.
- **Code Quality** - The changes impact analyses when `analysis-kinds: code-quality`.
- **CCR** - The changes impact analyses for Copilot Code Reviews.
- **Third-party analyses** - The changes affect the `upload-sarif` action.

Environments:

- **Dotcom** - Impacts CodeQL workflows on `github.com` and/or GitHub Enterprise Cloud with Data Residency.
- **GHES** - Impacts CodeQL workflows on GitHub Enterprise Server.
- **Testing/None** - This change does not impact any CodeQL workflows in production.

#### How did/will you validate this change?

<!-- Delete options that don't apply. -->

- **Test repository** - This change will be tested on a test repository before merging.
- **Unit tests** - I am depending on unit test coverage (i.e. tests in `.test.ts` files).
- **End-to-end tests** - I am depending on PR checks (i.e. tests in `pr-checks`).
- **Other** - Please provide details.
- **None** - I am not validating these changes.

#### If something goes wrong after this change is released, what are the mitigation and rollback strategies?

<!-- Delete strategies that don't apply. -->

- **Feature flags** - All new or changed code paths can be fully disabled with corresponding feature flags.
- **Rollback** - Change can only be disabled by rolling back the release or releasing a new version with a fix.
- **Other** - Please provide details.

#### How will you know if something goes wrong after this change is released?

<!-- Delete options that don't apply. -->

- **Telemetry** - I rely on existing telemetry or have made changes to the telemetry.
    - **Dashboards** - I will watch relevant dashboards for issues after the release. Consider whether this requires this change to be released at a particular time rather than as part of a regular release.
    - **Alerts** - New or existing monitors will trip if something goes wrong with this change.
- **Other** - Please provide details.

#### Are there any special considerations for merging or releasing this change?

<!--
    Consider whether this change depends on a different change in another repository that should be released first.
-->

- **No special considerations** - This change can be merged at any time.
- **Special considerations** - This change should only be merged once certain preconditions are met. Please provide details of those or link to this PR from an internal issue.

### Merge / deployment checklist

- Confirm this change is backwards compatible with existing workflows.
- Consider adding a [changelog](https://github.com/github/codeql-action/blob/main/CHANGELOG.md) entry for this change.
- Confirm the [readme](https://github.com/github/codeql-action/blob/main/README.md) and docs have been updated if necessary.
