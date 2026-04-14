#!/usr/bin/env npx tsx

/*
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

import { EnvVar } from "../src/environment";

import { BUILTIN_LANGUAGES_FILE } from "./config";

/** Resolve all known language extractor directories. */
function resolveLanguages(codeqlPath: string): Record<string, string[]> {
  return JSON.parse(
    execFileSync(codeqlPath, ["resolve", "languages", "--format=json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        [EnvVar.EXPERIMENTAL_FEATURES]: "true", // include experimental languages
      },
    }),
  ) as Record<string, string[]>;
}

/**
 * Return the sorted list of languages whose extractors ship default queries.
 *
 * @param extractorDirs - Map from language to list of extractor directories
 */
function findLanguagesWithDefaultQueries(
  extractorDirs: Record<string, string[]>,
): string[] {
  const languages: string[] = [];

  for (const [language, dirs] of Object.entries(extractorDirs)) {
    if (dirs.length !== 1) {
      throw new Error(
        `Expected exactly one extractor directory for language '${language}', but found ${dirs.length}: ${dirs.join(
          ", ",
        )}`,
      );
    }

    const extractorYmlPath = path.join(dirs[0], "codeql-extractor.yml");

    if (!fs.existsSync(extractorYmlPath)) {
      throw new Error(
        `Extractor YAML not found for language '${language}' at expected path: ${extractorYmlPath}`,
      );
    }

    const extractorYml = yaml.parse(fs.readFileSync(extractorYmlPath, "utf8"));
    const defaultQueries: unknown[] | undefined = extractorYml.default_queries;

    if (Array.isArray(defaultQueries) && defaultQueries.length > 0) {
      console.log(
        `  ✅ ${language}: included (default queries: ${JSON.stringify(defaultQueries)})`,
      );
      languages.push(language);
    } else {
      console.log(`  ❌ ${language}: excluded (no default queries)`);
    }
  }

  return languages.sort();
}

/**
 * Resolve language aliases from the CodeQL CLI, keeping only those whose
 * target is in the given set of included languages.
 */
function resolveAliases(
  codeqlPath: string,
  includedLanguages: Set<string>,
): Record<string, string> {
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

  return Object.fromEntries(
    Object.entries((betterjsonOutput.aliases ?? {}) as Record<string, string>)
      .filter(([, target]) => includedLanguages.has(target))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Write the built-in languages data to disk. */
function writeBuiltinLanguages(
  languages: string[],
  aliases: Record<string, string>,
): void {
  const content = `${JSON.stringify({ languages, aliases }, null, 2)}\n`;
  fs.mkdirSync(path.dirname(BUILTIN_LANGUAGES_FILE), { recursive: true });
  fs.writeFileSync(BUILTIN_LANGUAGES_FILE, content);

  console.log(`\nWrote ${BUILTIN_LANGUAGES_FILE}`);
  console.log(`  Languages: ${languages.join(", ")}`);
  console.log(`  Aliases: ${Object.keys(aliases).join(", ")}`);
}

function main(): void {
  const codeqlPath = process.argv[2] || "codeql";

  const extractorDirs = resolveLanguages(codeqlPath);
  const languages = findLanguagesWithDefaultQueries(extractorDirs);
  const aliases = resolveAliases(codeqlPath, new Set(languages));
  writeBuiltinLanguages(languages, aliases);
}

main();
