### Merge / deployment checklist

- Run test builds as necessary. Can be on this repository or [elsewhere](https://github.com/github/turbo-scan/#testing-changes-to-codeql-action) as needed in order to test the change.
  - [ ] CodeQL using init/finish actions
  - [ ] 3rd party tool using upload action
- [ ] Confirm this change is backwards compatible with existing workflows.
- [ ] Confirm the [readme](https://github.com/github/codeql-action/blob/master/README.md) and [sarif-demo](https://github.com/Anthophila/sarif-demo) have been updated if necessary.

### Rollout plan for codeql-action
https://github.com/github/dsp-code-scanning/blob/master/docs/code-scanning-action-rollout-plan.md
