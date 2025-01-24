import { parseLanguage, Language } from "./languages";
import { Logger } from "./logging";

export type Credential = {
  type: string;
  host?: string;
  url?: string;
  username?: string;
  password?: string;
  token?: string;
};

const LANGUAGE_TO_REGISTRY_TYPE: Record<Language, string> = {
  java: "maven_repository",
  csharp: "nuget_feed",
  javascript: "npm_registry",
  python: "python_index",
  ruby: "rubygems_server",
  rust: "cargo_registry",
  // We do not have an established proxy type for these languages, thus leaving empty.
  actions: "",
  cpp: "",
  go: "",
  swift: "",
} as const;

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
  const parsed = JSON.parse(credentialsStr) as Credential[];
  const out: Credential[] = [];
  for (const e of parsed) {
    if (e.url === undefined && e.host === undefined) {
      throw new Error("Invalid credentials - must specify host or url");
    }

    // Filter credentials based on language if specified. `type` is the registry type.
    // E.g., "maven_feed" for Java/Kotlin, "nuget_repository" for C#.
    if (registryTypeForLanguage && e.type !== registryTypeForLanguage) {
      continue;
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
