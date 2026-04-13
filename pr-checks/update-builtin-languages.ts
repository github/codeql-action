#!/usr/bin/env npx tsx

/**
 * Updates src/languages/builtin.json by querying the CodeQL CLI for:
 * - Languages that have default queries (via codeql-extractor.yml)
 * - Language aliases (via `codeql resolve languages --format=betterjson --extractor-include-aliases`)
 *
 * Usage:
 *   npx tsx pr-checks/update-builtin-languages.ts [path-to-codeql]
 *
 * If no path is given, falls back to "codeql".
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import * as yaml from "yaml";

const codeqlPath = process.argv[2] || "codeql";

// Step 1: Resolve all language extractor directories.
const resolveJson: Record<string, string[]> = JSON.parse(
  execFileSync(codeqlPath, ["resolve", "languages", "--format=json"], {
    encoding: "utf8",
  }),
);

// Step 2: For each language, read codeql-extractor.yml and check default_queries.
const languages: string[] = [];

for (const [language, dirs] of Object.entries(resolveJson)) {
  const extractorDir = dirs[0];
  const extractorYmlPath = path.join(extractorDir, "codeql-extractor.yml");

  if (!fs.existsSync(extractorYmlPath)) {
    throw new Error(
      `Extractor YAML not found for language '${language}' at expected path: ${extractorYmlPath}`,
    );
  }

  const extractorYml = yaml.parse(fs.readFileSync(extractorYmlPath, "utf8"));
  const defaultQueries: unknown[] | undefined = extractorYml.default_queries;

  if (Array.isArray(defaultQueries) && defaultQueries.length > 0) {
    console.log(
      `  ✅ ${language}: included (default_queries: ${JSON.stringify(defaultQueries)})`,
    );
    languages.push(language);
  } else {
    console.log(`  ❌ ${language}: excluded (no default queries)`);
  }
}

languages.sort();

// Step 3: Resolve aliases, filtered to only those targeting included languages.
const betterjsonOutput = JSON.parse(
  execFileSync(
    codeqlPath,
    [
      "resolve",
      "languages",
      "--format=betterjson",
      "--extractor-include-aliases",
    ],
    { encoding: "utf8" },
  ),
);

const languageSet = new Set(languages);
const aliases: Record<string, string> = Object.fromEntries(
  Object.entries((betterjsonOutput.aliases ?? {}) as Record<string, string>)
    .filter(([, target]) => languageSet.has(target))
    .sort(([a], [b]) => a.localeCompare(b)),
);

// Step 4: Write builtin.json.
const outputPath = path.join(
  __dirname,
  "..",
  "src",
  "languages",
  "builtin.json",
);

const content = `${JSON.stringify({ languages, aliases }, null, 2)}\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, content);

console.log(`\nWrote ${outputPath}`);
console.log(`  Languages: ${languages.join(", ")}`);
console.log(`  Aliases: ${Object.keys(aliases).join(", ")}`);
