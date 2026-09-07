# codeql-action Repository Map

| Area | Location | Role |
|---|---|---|
| TypeScript source | `src/` | CodeQL Action implementation and shared utilities. |
| Tests and fixtures | `__tests__/`, `pr-checks/`, and related fixture directories | Unit, integration, workflow, and release validation. |
| Action metadata | `action.yml` | Stub metadata in this fork; not a normal runtime entrypoint. |
| Generated output | `dist/` or release-generated bundles | Rebuilt artifacts; do not hand-edit. |
| Workflows | `.github/workflows/` | PR checks, build/bundle matrices, code scanning, release preparation, rollback, and maintenance. |
| Dependency metadata | `package.json`, lockfiles, advisory/configuration files | Supply-chain and reproducibility controls. |

## Discovery commands

```bash
node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts,null,2))"
find .github/workflows -maxdepth 1 -type f -printf '%f\n' | sort
find . -maxdepth 3 -type f \( -iname '*lock*' -o -iname '*dependabot*' -o -iname '*audit*' \) -print | sort
```

Always use the scripts and package-manager lockfile declared by the current checkout. Read the applicable workflow before changing a generated bundle or release path.
