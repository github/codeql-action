import * as core from "@actions/core";

import { KnownLanguage } from "./languages";
import { Logger } from "./logging";
import { ConfigurationError } from "./util";

export type Credential = {
  type: string;
  host?: string;
  url?: string;
  username?: string;
  password?: string;
  token?: string;
};

/*
 * Language aliases supported by the start-proxy Action.
 *
 * In general, the CodeQL CLI is the source of truth for language aliases, and to
 * allow us to more easily support new languages, we want to avoid hardcoding these
 * aliases in the Action itself.  However this is difficult to do in the start-proxy
 * Action since this Action does not use CodeQL, so we're accepting some hardcoding
 * for this Action.
 */
const LANGUAGE_ALIASES: { [lang: string]: KnownLanguage } = {
  c: KnownLanguage.cpp,
  "c++": KnownLanguage.cpp,
  "c#": KnownLanguage.csharp,
  kotlin: KnownLanguage.java,
  typescript: KnownLanguage.javascript,
  "javascript-typescript": KnownLanguage.javascript,
  "java-kotlin": KnownLanguage.java,
};

/**
 * Parse the start-proxy language input into its canonical CodeQL language name.
 *
 * Exported for testing. Do not use this outside of the start-proxy Action
 * to avoid complicating the process of adding new CodeQL languages.
 */
export function parseLanguage(language: string): KnownLanguage | undefined {
  // Normalize to lower case
  language = language.trim().toLowerCase();

  // See if it's an exact match
  if (language in KnownLanguage) {
    return language as KnownLanguage;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
  }

  return undefined;
}

const LANGUAGE_TO_REGISTRY_TYPE: Partial<Record<KnownLanguage, string[]>> = {
  java: ["maven_repository"],
  csharp: ["nuget_feed"],
  javascript: ["npm_registry"],
  python: ["python_index"],
  ruby: ["rubygems_server"],
  rust: ["cargo_registry"],
  go: ["goproxy_server"],
} as const;

/**
 * Checks that `value` is neither `undefined` nor `null`.
 * @param value The value to test.
 * @returns Narrows the type of `value` to exclude `undefined` and `null`.
 */
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

// getCredentials returns registry credentials from action inputs.
// It prefers `registries_credentials` over `registry_secrets`.
// If neither is set, it returns an empty array.
export function getCredentials(
  logger: Logger,
  registrySecrets: string | undefined,
  registriesCredentials: string | undefined,
  languageString: string | undefined,
): Credential[] {
  const language = languageString ? parseLanguage(languageString) : undefined;
  const registryTypeForLanguage = language
    ? LANGUAGE_TO_REGISTRY_TYPE[language]
    : undefined;

  let credentialsStr: string;
  if (registriesCredentials !== undefined) {
    logger.info(`Using registries_credentials input.`);
    credentialsStr = Buffer.from(registriesCredentials, "base64").toString();
  } else if (registrySecrets !== undefined) {
    logger.info(`Using registry_secrets input.`);
    credentialsStr = registrySecrets;
  } else {
    logger.info(`No credentials defined.`);
    return [];
  }

  // Parse and validate the credentials
  let parsed: Credential[];
  try {
    parsed = JSON.parse(credentialsStr) as Credential[];
  } catch {
    // Don't log the error since it might contain sensitive information.
    logger.error("Failed to parse the credentials data.");
    throw new ConfigurationError("Invalid credentials format.");
  }

  // Check that the parsed data is indeed an array.
  if (!Array.isArray(parsed)) {
    throw new ConfigurationError(
      "Expected credentials data to be an array of configurations, but it is not.",
    );
  }

  const out: Credential[] = [];
  for (const e of parsed) {
    if (e === null || typeof e !== "object") {
      throw new ConfigurationError("Invalid credentials - must be an object");
    }

    // Mask credentials to reduce chance of accidental leakage in logs.
    if (isDefined(e.password)) {
      core.setSecret(e.password);
    }
    if (isDefined(e.token)) {
      core.setSecret(e.token);
    }

    if (!isDefined(e.url) && !isDefined(e.host)) {
      // The proxy needs one of these to work. If both are defined, the url has the precedence.
      throw new ConfigurationError(
        "Invalid credentials - must specify host or url",
      );
    }

    // Filter credentials based on language if specified. `type` is the registry type.
    // E.g., "maven_feed" for Java/Kotlin, "nuget_repository" for C#.
    if (
      registryTypeForLanguage &&
      !registryTypeForLanguage.some((t) => t === e.type)
    ) {
      continue;
    }

    const isPrintable = (str: string | undefined): boolean => {
      return str ? /^[\x20-\x7E]*$/.test(str) : true;
    };

    if (
      !isPrintable(e.type) ||
      !isPrintable(e.host) ||
      !isPrintable(e.url) ||
      !isPrintable(e.username) ||
      !isPrintable(e.password) ||
      !isPrintable(e.token)
    ) {
      throw new ConfigurationError(
        "Invalid credentials - fields must contain only printable characters",
      );
    }

    out.push({
      type: e.type,
      host: e.host,
      url: e.url,
      username: e.username,
      password: e.password,
      token: e.token,
    });
  }
  return out;
}
