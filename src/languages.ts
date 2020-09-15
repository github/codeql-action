import * as api from "./api-client";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";

// All the languages supported by CodeQL
export enum Language {
  csharp = "csharp",
  cpp = "cpp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
}

// Additional names for languages
const LANGUAGE_ALIASES: { [lang: string]: Language } = {
  c: Language.cpp,
  "c++": Language.cpp,
  "c#": Language.csharp,
  typescript: Language.javascript,
};

// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
export function parseLanguage(language: string): Language | undefined {
  // Normalise to lower case
  language = language.toLowerCase();

  // See if it's an exact match
  if (language in Language) {
    return language as Language;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
  }

  return undefined;
}

export function isTracedLanguage(language: Language): boolean {
  return ["cpp", "java", "csharp"].includes(language);
}

export function isScannedLanguage(language: Language): boolean {
  return !isTracedLanguage(language);
}

export function getNoLanguagesError(): string {
  return (
    "Did not detect any languages to analyze. " +
    "Please update input in workflow or check that GitHub detects the correct languages in your repository."
  );
}

export function getUnknownLanguagesError(languages: string[]): string {
  return `Did not recognise the following languages: ${languages.join(", ")}`;
}

/**
 * Get the languages to analyse.
 *
 * The result is obtained from the action input parameter 'languages' if that
 * has been set, otherwise it is deduced as all languages in the repo that
 * can be analysed.
 *
 * If no languages could be detected from either the workflow or the repository
 * then throw an error.
 */
export async function getLanguages(
  languagesInput: string | undefined,
  repository: RepositoryNwo,
  githubAuth: string,
  githubUrl: string,
  logger: Logger
): Promise<Language[]> {
  // Obtain from action input 'languages' if set
  let languages = (languagesInput || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  logger.info(`Languages from configuration: ${JSON.stringify(languages)}`);

  if (languages.length === 0) {
    // Obtain languages as all languages in the repo that can be analysed
    languages = await getLanguagesInRepo(
      repository,
      githubAuth,
      githubUrl,
      logger
    );
    logger.info(
      `Automatically detected languages: ${JSON.stringify(languages)}`
    );
  }

  // If the languages parameter was not given and no languages were
  // detected then fail here as this is a workflow configuration error.
  if (languages.length === 0) {
    throw new Error(getNoLanguagesError());
  }

  // Make sure they are supported
  const parsedLanguages: Language[] = [];
  const unknownLanguages: string[] = [];
  for (const language of languages) {
    const parsedLanguage = parseLanguage(language);
    if (parsedLanguage === undefined) {
      unknownLanguages.push(language);
    } else if (parsedLanguages.indexOf(parsedLanguage) === -1) {
      parsedLanguages.push(parsedLanguage);
    }
  }
  if (unknownLanguages.length > 0) {
    throw new Error(getUnknownLanguagesError(unknownLanguages));
  }

  return parsedLanguages;
}

/**
 * Gets the set of languages in the current repository
 */
async function getLanguagesInRepo(
  repository: RepositoryNwo,
  githubAuth: string,
  githubUrl: string,
  logger: Logger
): Promise<Language[]> {
  logger.debug(`GitHub repo ${repository.owner} ${repository.repo}`);
  const response = await api
    .getApiClient(githubAuth, githubUrl, true)
    .repos.listLanguages({
      owner: repository.owner,
      repo: repository.repo,
    });

  logger.debug(`Languages API response: ${JSON.stringify(response)}`);

  // The GitHub API is going to return languages in order of popularity,
  // When we pick a language to autobuild we want to pick the most popular traced language
  // Since sets in javascript maintain insertion order, using a set here and then splatting it
  // into an array gives us an array of languages ordered by popularity
  const languages: Set<Language> = new Set();
  for (const lang of Object.keys(response.data)) {
    const parsedLang = parseLanguage(lang);
    if (parsedLang !== undefined) {
      languages.add(parsedLang);
    }
  }
  return [...languages];
}
