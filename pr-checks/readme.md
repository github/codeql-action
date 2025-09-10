# PR Checks

This folder contains the workflow generator that must be run in order to create the
workflows used by the CodeQL Action CI. Workflows must be recreated after any change
to one of the files in this directory.

## Updating workflows

1. Install https://github.com/casey/just by whichever way you prefer.
2. Run `just update-pr-checks` in your terminal.

### If you don't want to intall `just`

Manually run each step in the `justfile`.

## Sync-back automation

When Dependabot updates action versions in the generated workflow files (`.github/workflows/__*.yml`), 
the sync-back automation ensures those changes are properly reflected in the source templates.

### Running sync-back manually

To sync action versions from generated workflows back to source templates:

```bash
# Dry run to see what would be changed
./pr-checks/sync-back.sh --dry-run --verbose

# Actually apply the changes
./pr-checks/sync-back.sh
```

The sync-back script (`sync-back.py`) automatically updates:
- Hardcoded action versions in `pr-checks/sync.py`
- Action version references in template files in `pr-checks/checks/`
- Action version references in regular workflow files

This ensures that the `verify-pr-checks.sh` test always passes after Dependabot PRs.
