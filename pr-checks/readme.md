# PR Checks

This folder contains the code supporting the workflows run when a PR is created.

## Update

If you need to make a change to any of the PR checks, you need to perform the following
steps:

1. Make the change - the code for the PR checks is under the `pr-checks/checks/` folder.
2. Run the `sync.py` file to produce (and sync) the final workflow files under `.github/`

The second part requires some associated steps (create a virtual environment, download
the dependencies for the Python script, etc), so we have automated this with the `justfile`
included in this folder.

### 1-step update

1. Install https://github.com/casey/just by whichever way you prefer.
2. Run `$ just update-pr-checks` in your terminal.

If you don't wish to install `just`, you can also manually perform the steps
outlined in the `justfile` under the `update-pr-checks` action.
