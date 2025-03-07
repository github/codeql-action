# Perform all working copy cleanup operations
all: lint sync

# Lint source typescript
lint:
    npm run lint -- --fix

# Sync generated files (javascript and PR checks)
sync: build update-pr-checks

# Perform all necessary steps to update the PR checks
update-pr-checks:
    pr-checks/sync.sh

# Transpile typescript code into javascript
build:
    npm run build
