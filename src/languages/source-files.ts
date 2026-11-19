import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

import type { Logger } from "../logging";

/** The subset of an extractor's `codeql-extractor.yml` file that we read. */
interface ExtractorFileTypesConfig {
  file_types?: Array<{ name?: string; extensions?: string[] }>;
}

/**
 * The name of the file type that the JavaScript extractor uses for data and
 * configuration files, such as `.json` and `.yml` files. CodeQL does not
 * count these files as source code, so they alone do not make an analysis
 * succeed.
 */
const DATA_FILE_TYPE_NAME = "data";

/**
 * Reads the source file extensions that an extractor declares in the
 * `file_types` section of its `codeql-extractor.yml` file. Ignores the
 * extensions of data file types.
 *
 * @returns The lowercase extensions, or `undefined` if the extractor does not
 * declare any or the file cannot be read.
 */
export function getExtractorFileExtensions(
  extractorRoot: string,
  logger: Logger,
): string[] | undefined {
  const extractorConfigPath = path.join(extractorRoot, "codeql-extractor.yml");
  let extractorConfig: ExtractorFileTypesConfig | undefined;
  try {
    extractorConfig = yaml.load(
      fs.readFileSync(extractorConfigPath, "utf8"),
    ) as ExtractorFileTypesConfig | undefined;
  } catch (e) {
    logger.debug(
      `Could not read file types from ${extractorConfigPath}: ${String(e)}`,
    );
    return undefined;
  }
  const extensions = (extractorConfig?.file_types ?? [])
    .filter((fileType) => fileType.name !== DATA_FILE_TYPE_NAME)
    .flatMap((fileType) => fileType.extensions ?? []);
  if (extensions.length === 0) {
    return undefined;
  }
  return extensions.map((extension) => extension.toLowerCase());
}

/**
 * Finds which of the given file extensions occur in a directory tree. Skips
 * `.git` directories and does not follow symbolic links. Stops as soon as all
 * extensions have been found.
 *
 * @returns The subset of `extensions` that at least one file has.
 */
export function findSourceFileExtensions(
  rootDir: string,
  extensions: Set<string>,
): Set<string> {
  const found = new Set<string>();
  const pendingDirs = [rootDir];
  while (pendingDirs.length > 0 && found.size < extensions.size) {
    const dir = pendingDirs.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name !== ".git") {
          pendingDirs.push(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();
        if (extensions.has(extension)) {
          found.add(extension);
        }
      }
    }
  }
  return found;
}

/**
 * Removes autodetected languages that have no source files in the checkout.
 *
 * The GitHub languages API reports the languages of the default branch, and
 * GitHub updates this data in the background. It can therefore report a
 * language whose last file was removed, for example by a recent push or by the
 * pull request under analysis. Analysis of such a language fails because
 * CodeQL sees no source code for it.
 *
 * A language is kept if its extractor declares no file types, since we then
 * cannot tell whether the checkout contains source files for it.
 *
 * @param extractorRoots A map from each language to its extractor root.
 * @returns The languages that have source files in `sourceRoot`.
 */
export function filterLanguagesWithSourceFiles(
  languages: string[],
  extractorRoots: Record<string, string | undefined>,
  sourceRoot: string,
  logger: Logger,
): string[] {
  const extensionsByLanguage = new Map<string, string[]>();
  for (const language of languages) {
    const extractorRoot = extractorRoots[language];
    const extensions =
      extractorRoot === undefined
        ? undefined
        : getExtractorFileExtensions(extractorRoot, logger);
    if (extensions !== undefined) {
      extensionsByLanguage.set(language, extensions);
    }
  }
  if (extensionsByLanguage.size === 0) {
    return languages;
  }

  const foundExtensions = findSourceFileExtensions(
    sourceRoot,
    new Set([...extensionsByLanguage.values()].flat()),
  );

  return languages.filter((language) => {
    const extensions = extensionsByLanguage.get(language);
    if (
      extensions === undefined ||
      extensions.some((extension) => foundExtensions.has(extension))
    ) {
      return true;
    }
    logger.info(
      `Not analyzing ${language}: the GitHub languages API reported it, but the checkout contains no files with the extensions ${extensions.join(", ")}.`,
    );
    return false;
  });
}
