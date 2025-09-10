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

The sync-back script automatically detects all actions used in generated workflows and preserves
version comments (e.g., `# v1.2.3`) when syncing versions between files.

### Running sync-back manually

To sync action versions from generated workflows back to source templates:

```bash
# Dry run to see what would be changed
python3 pr-checks/sync-back.py --dry-run --verbose

# Actually apply the changes
python3 pr-checks/sync-back.py
```

The sync-back script automatically updates:
- Hardcoded action versions in `pr-checks/sync.py`
- Action version references in template files in `pr-checks/checks/`

Regular workflow files are updated directly by Dependabot and don't need sync-back.

This ensures that the `verify-pr-checks.sh` test always passes after Dependabot PRs.

### Testing

The sync-back script includes comprehensive tests that can be run with:

```bash
python3 pr-checks/test_sync_back.py -v
```
