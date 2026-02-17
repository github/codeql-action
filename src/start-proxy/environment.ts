import { JavaEnvVars, KnownLanguage, Language } from "../languages";
import { Logger } from "../logging";
import { isDefined } from "../util";

/**
 * Checks whether an environment variable named `name` is set and logs its value if set.
 *
 * @param logger The logger to use.
 * @param name The name of the environment variable.
 * @returns True if set or false otherwise.
 */
function checkEnvVar(logger: Logger, name: string): boolean {
  const value = process.env[name];
  if (isDefined(value)) {
    logger.info(`Environment variable '${name}' is set to '${value}'.`);
    return true;
  } else {
    logger.debug(`Environment variable '${name}' is not set.`);
    return false;
  }
}

/** Java-specific environment variables which may contain information about proxy settings. */
export const JAVA_PROXY_ENV_VARS: JavaEnvVars[] = [
  JavaEnvVars.JAVA_TOOL_OPTIONS,
  JavaEnvVars.JDK_JAVA_OPTIONS,
  JavaEnvVars._JAVA_OPTIONS,
];

/**
 * Checks whether any Java-specific environment variables which may contain proxy
 * configurations are set and logs their values if so.
 */
export function checkJavaEnvVars(logger: Logger) {
  for (const envVar of JAVA_PROXY_ENV_VARS) {
    checkEnvVar(logger, envVar);
  }
}

/** Enumerates environment variable names which may contain information about proxy settings. */
export enum ProxyEnvVars {
  HTTP_PROXY = "HTTP_PROXY",
  HTTPS_PROXY = "HTTPS_PROXY",
  ALL_PROXY = "ALL_PROXY",
}

/**
 * Checks whether any proxy-related environment variables are set and logs their values if so.
 */
export function checkProxyEnvVars(logger: Logger) {
  // Both upper-case and lower-case variants of these environment variables are used.
  for (const envVar of Object.values(ProxyEnvVars)) {
    checkEnvVar(logger, envVar);
    checkEnvVar(logger, envVar.toLowerCase());
  }
}

/**
 * Inspects environment variables and other configurations on the runner to determine whether
 * any settings that may affect the operation of the proxy are present. All relevant information
 * is written to the log.
 *
 * @param logger The logger to use.
 * @param language The enabled language, if known.
 */
export function checkProxyEnvironment(
  logger: Logger,
  language: Language | undefined,
) {
  // Determine whether there is an existing proxy configured.
  checkProxyEnvVars(logger);

  // Check language-specific configurations. If we don't know the language,
  // then we perform all checks.
  if (language === undefined || language === KnownLanguage.java) {
    checkJavaEnvVars(logger);
  }
}
