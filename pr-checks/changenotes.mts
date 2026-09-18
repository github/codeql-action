#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "path";

import { matter } from "lite-matter";

import {
  addBodyLinesToUnreleasedSection,
  parseChangelog,
  renderChangelog,
  withChangelog,
} from "./changelog";
import { isValidAllChangenoteFiles } from "./changelog/validate.mjs";
import { CHANGENOTES_DIR } from "./config";

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

function main(): number {
  const { positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
  });
  const [command] = positionals;
  switch (command) {
    case undefined:
    case "help":
      return usage();
    case "flush":
      return flush();
    case "validate":
      return validate();
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

function usage(): number {
  const message =
    "Usage: changenotes.mts flush\n" +
    "       changenotes.mts validate\n" +
    "       changenotes.mts help";
  console.log(message);
  return 0;
}

function flush(): number {
  try {
    // Get the file paths to our changenotes; these will be useful later.
    const changenotePaths = fs
      .readdirSync(CHANGENOTES_DIR)
      .filter((name) => name !== ".gitkeep")
      .map((name) => path.join(CHANGENOTES_DIR, name));

    // From the file paths, we read the files to obtain the actual notes themselves.
    const changenotes = changenotePaths.map((filePath) => {
      const fileBody = readFileSync(filePath).toString();
      const { content } = matter(fileBody);
      return content.trim();
    });

    withChangelog((contents) => {
      const changelog = parseChangelog(contents);
      addBodyLinesToUnreleasedSection(changelog, changenotes);
      return renderChangelog(changelog);
    }, {});

    // Delete changenotes only after successful processing.
    for (const p of changenotePaths) {
      fs.unlinkSync(p);
    }

    return 0;
  } catch (e) {
    console.error("Failed to flush changenotes to 'CHANGELOG.md'", e);
  }

  return 1;
}

function validate(): number {
  try {
    if (isValidAllChangenoteFiles(fs.readdirSync(CHANGENOTES_DIR))) {
      console.log(`All changenotes in '${CHANGENOTES_DIR}' are valid.`);
      return 0;
    }
  } catch (error) {
    console.error(
      `Failed to read changenotes directory '${CHANGENOTES_DIR}'`,
      error,
    );
  }
  return 1;
}
