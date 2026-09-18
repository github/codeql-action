#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "path";

import { ExitCode } from "@actions/core";
import { matter } from "lite-matter";

import {
  addBodyLinesToUnreleasedSection,
  parseChangelog,
  renderChangelog,
  withChangelog,
} from "./changelog";
import { isValidChangenoteFile } from "./changelog/validate.mjs";
import { CHANGENOTES_DIR } from "./config";

/**
 * Describes a changenote file, including its file path, frontmatter, and content.
 */
interface ChangenoteFile {
  absolutePath: string;
  data: Record<string, any>;
  content: string;
}

/**
 * Returns the absolute file paths of all files in
 * {@link CHANGENOTES_DIR} (except ".gitkeep").
 * */
function listUnreleasedChangenoteDir(): string[] {
  return fs
    .readdirSync(CHANGENOTES_DIR)
    .filter((name) => name !== ".gitkeep")
    .map((name) => path.join(CHANGENOTES_DIR, name));
}

/**
 * Scans the {@link CHANGENOTES_DIR} directory for changenote files
 * and returns a parsed listing of those changenote files.
 */
function getChangenotes(): ChangenoteFile[] {
  return listUnreleasedChangenoteDir().map((absolutePath) => {
    return {
      absolutePath,
      ...matter(fs.readFileSync(absolutePath, "utf-8")),
    };
  });
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error);
    process.exit(ExitCode.Failure);
  }
}

function main(): ExitCode {
  const { positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
  });
  const [command] = positionals;
  switch (command) {
    case undefined:
    case "help":
      return usage();
    case "assemble":
      return assemble();
    case "validate":
      return validate();
    default:
      console.error(`Unknown command: ${command}`);
      return ExitCode.Failure;
  }
}

function usage(): ExitCode {
  const message =
    "Usage: changenotes.mts assemble\n" +
    "       changenotes.mts validate\n" +
    "       changenotes.mts help";
  console.log(message);
  return ExitCode.Success;
}

function assemble(): ExitCode {
  try {
    const changenotes = getChangenotes();
    const changenoteBodies = changenotes.map((c) => c.content);
    const changenotePaths = changenotes.map((c) => c.absolutePath);

    withChangelog((contents) => {
      const changelog = parseChangelog(contents);
      addBodyLinesToUnreleasedSection(changelog, changenoteBodies);
      return renderChangelog(changelog);
    }, {});

    // Delete changenotes only after successful processing.
    for (const p of changenotePaths) {
      fs.unlinkSync(p);
    }

    return ExitCode.Success;
  } catch (e) {
    console.error("Failed to assemble changenotes to 'CHANGELOG.md'", e);
  }

  return ExitCode.Failure;
}

function validate(): ExitCode {
  try {
    const allChangenotesValid = getChangenotes().reduce(
      (r, changenote) => r && isValidChangenoteFile(changenote.absolutePath),
      true,
    );
    if (allChangenotesValid) {
      console.log(`All changenotes in '${CHANGENOTES_DIR}' are valid.`);
      return ExitCode.Success;
    }
  } catch (error) {
    console.error(
      `Failed to read changenotes directory '${CHANGENOTES_DIR}'`,
      error,
    );
  }
  return ExitCode.Failure;
}
