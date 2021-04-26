import { LocDir } from "github-linguist";

import { Logger } from "./logging";

// Map from linguist language names to language prefixes used in our metrics
const supportedLanguages = {
  c: "cpp",
  "c++": "cpp",
  "c#": "cs",
  go: "go",
  java: "java",
  javascript: "js",
  python: "py",
  ruby: "rb",
  typescript: "js",
};

/**
 * Count the lines of code of the specified language using the include
 * and exclude glob paths.
 *
 * @param cwd the root directory to start the count from
 * @param include glob patterns to include in the search for relevant files
 * @param exclude glob patterns to exclude in the search for relevant files
 * @param dbLanguages list of languages to include in the results
 * @param logger object to log results
 */
export async function countLoc(
  cwd: string,
  include: string[],
  exclude: string[],
  dbLanguages: string[],
  logger: Logger
): Promise<Record<string, number>> {
  const result = await new LocDir({
    cwd,
    include,
    exclude,
  }).loadInfo();

  // The analysis counts LoC in all languages. We need to
  // extract the languages we care about. Also, note that
  // the analysis uses slightly different names for language.
  const lineCounts = Object.entries(result.languages).reduce(
    (obj, [language, { code }]) => {
      const dbLanguage = supportedLanguages[language];
      if (dbLanguage && dbLanguages.includes(dbLanguage)) {
        obj[dbLanguage] = code + (obj[dbLanguage] || 0);
      }
      return obj;
    },
    {} as Record<string, number>
  );

  if (Object.keys(lineCounts).length) {
    logger.debug("Lines of code count:");
    for (const [language, count] of Object.entries(lineCounts)) {
      logger.debug(`  ${language}: ${count}`);
    }
  } else {
    logger.warning("Did not find any lines of code in database.");
  }

  return lineCounts;
}
