# Perform all working copy cleanup operations
all: lint sync

# Lint source typescript
lint:
    npm run lint-fix

# Sync generated files (javascript and PR checks)
sync: build update-pr-checks

# Perform all necessary steps to update the PR checks
update-pr-checks:
    pr-checks/sync.sh

# Transpile typescript code into javascript
build:
    npm run build

# Build then run all the tests
test: build
    npm run test

# Run the tests for a single file
test_file filename: build
    npx ava --verbose {{filename}}

# FOTIS: This shouldn't really be needed, as it's covered by `sync`,
# however, I recall having messed my environment such that this was the
# only solution, so keeping it here for convenience & docs.
[doc("Refresh the lib directory (the .js build artefacts)")]
[confirm]
refresh-lib:
    rm -rf lib && npm run build
