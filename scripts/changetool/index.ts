import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { isValidChangenoteFile } from "./cli/validate.ts";

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
  const [command, ...paths] = positionals;
  switch (command) {
    case undefined:
    case "help":
      return usage();
    case "validate":
      return validate(paths);
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

function usage(): number {
  console.log("Usage: changetool validate <path> [<path> ...]");
  return 0;
}

function validate(paths: string[]): number {
  let valid = true;
  if (paths.length === 0) {
    console.error("error: no paths provided (see 'help' command for usage)");
    return 1;
  }
  for (const path of paths) {
    if (!isValidChangenoteFile(path)) {
      valid = false;
    }
  }
  return valid ? 0 : 1;
}
