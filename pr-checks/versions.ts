import * as fs from "node:fs";

import { DryRunOption, PACKAGE_JSON } from "./config";

export function withPackageJson<T>(
  transformer: (content: string) => { value: T; content?: string },
  options: DryRunOption,
): T {
  const content = fs.readFileSync(PACKAGE_JSON, "utf8");
  const result = transformer(content);

  if (result.content !== undefined) {
    if (!options.dryRun) {
      fs.writeFileSync(PACKAGE_JSON, result.content, "utf8");
    } else {
      console.info(`[DRY RUN] Would have written an updated package.json`);
    }
  }

  return result.value;
}

/** Reads the current version from `package.json`. */
export function getCurrentVersion(content: string): string | undefined {
  const pkg: { version: string } = JSON.parse(content);
  return pkg.version;
}

/**
 * Replaces the version in `package.json` textually. Only updates the version
 * field that immediately follows the `"name": "codeql"` line.
 * `npm version` doesn't always work because of merge conflicts, so we
 * replace the version in package.json textually.
 */
export function replaceVersionInPackageJson(
  prevVersion: string,
  newVersion: string,
  content: string,
): string {
  const lines = content.split("\n");
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

  return output.join("\n");
}
