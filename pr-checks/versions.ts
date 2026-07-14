import * as fs from "node:fs";

import { DryRunOption, PACKAGE_JSON } from "./config";

/** Reads the current version from `package.json`. */
export function getCurrentVersion(): string | undefined {
  const pkg: { version: string } = JSON.parse(
    fs.readFileSync(PACKAGE_JSON, "utf8"),
  );
  return pkg.version;
}

/**
 * Replaces the version in `package.json` textually. Only updates the version
 * field that immediately follows the `"name": "codeql"` line.
 * `npm version` doesn't always work because of merge conflicts, so we
 * replace the version in package.json textually.
 */
export function replaceVersionInPackageJson(
  options: DryRunOption,
  prevVersion: string,
  newVersion: string,
): void {
  const lines = fs.readFileSync(PACKAGE_JSON, "utf8").split("\n");
  let prevLineIsCodeql = false;
  const output: string[] = [];

  for (const line of lines) {
    if (prevLineIsCodeql && line.includes(`"version": "${prevVersion}"`)) {
      output.push(line.replace(prevVersion, newVersion));
    } else {
      output.push(line);
    }
    prevLineIsCodeql = line.includes('"name": "codeql",');
  }

  if (!options.dryRun) {
    fs.writeFileSync(PACKAGE_JSON, `${output.join("\n")}\n`, "utf8");
  } else {
    console.info(
      `[DRY RUN] Would have replaced '${prevVersion}' with '${newVersion}' in package.json`,
    );
  }
}
