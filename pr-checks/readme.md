# PR Checks

This folder contains the workflow generator that must be run in order to create the
workflows used by the CodeQL Action CI. Workflows must be recreated after any change
to one of the files in this directory.

## Updating workflows

Run `./sync.sh` to invoke the workflow generator and re-generate the workflow files in `.github/workflows/` based on the templates in `pr-checks/checks/`.

Alternatively, you can use `just`:

1. Install https://github.com/casey/just by whichever way you prefer.
2. Run `just update-pr-checks` in your terminal.
