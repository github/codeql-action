#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

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
    case "validate":
      return validate();
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

function usage(): number {
  console.log(`Usage: changenotes.mts validate`);
  return 0;
}

function validate(): number {
  try {
    return isValidAllChangenoteFiles(fs.readdirSync(CHANGENOTES_DIR)) ? 0 : 1;
  } catch (error) {
    console.error(
      `${CHANGENOTES_DIR}: failed to read file or directory`,
      error,
    );
    return 1;
  }
}
