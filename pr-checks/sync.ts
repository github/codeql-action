#!/usr/bin/env npx tsx

import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

const THIS_DIR = __dirname;
const CHECKS_DIR = path.join(THIS_DIR, "checks");
const OUTPUT_DIR = path.join(THIS_DIR, "new-output");

/**
 * Load and parse a YAML file, returning its contents as an object.
 */
function loadYaml(filePath: string): any {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content);
}

/**
 * Serialize a value to YAML and write it to a file, prepended with the
 * standard header comment.
 */
function writeYaml(filePath: string, data: any): void {
  const header = `# Warning: This file is generated automatically, and should not be modified.
# Instead, please modify the template in the pr-checks directory and run:
#     pr-checks/sync.sh
# to regenerate this file.

`;
  const yamlStr = yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // Don't wrap long lines
    noRefs: true, // Don't use YAML anchors/aliases
    quotingType: "'", // Use single quotes where quoting is needed
    forceQuotes: false,
  });
  fs.writeFileSync(filePath, header + yamlStr, "utf8");
}

/**
 * Main entry point for the sync script.
 */
function main(): void {
  // Ensure the output directory exists.
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Discover and sort all check specification files.
  const checkFiles = fs
    .readdirSync(CHECKS_DIR)
    .filter((f) => f.endsWith(".yml"))
    .sort()
    .map((f) => path.join(CHECKS_DIR, f));

  console.log(`Found ${checkFiles.length} check specification(s).`);

  for (const file of checkFiles) {
    const checkName = path.basename(file, ".yml");
    const checkSpecification = loadYaml(file);

    console.log(`Processing: ${checkName} — "${checkSpecification.name}"`);

    // For now, write a placeholder workflow file.
    const outputPath = path.join(OUTPUT_DIR, `__${checkName}.yml`);
    writeYaml(outputPath, {});
  }

  console.log(
    `\nDone. Wrote ${checkFiles.length} workflow file(s) to ${OUTPUT_DIR}`,
  );
}

main();
