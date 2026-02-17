import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { JavaEnvVars, KnownLanguage, Language } from "../languages";
import { Logger } from "../logging";
import { getErrorMessage, isDefined } from "../util";

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

/**
 * Discovers paths to JDK directories based on JAVA_HOME and GHA-specific environement variables.
 * @returns A set of JDK paths.
 */
export function discoverActionsJdks(): Set<string> {
  const paths: Set<string> = new Set();

  // Check whether JAVA_HOME is set.
  const javaHome = process.env[JavaEnvVars.JAVA_HOME];
  if (isDefined(javaHome)) {
    paths.add(javaHome);
  }

  for (const [envVar, value] of Object.entries(process.env)) {
    if (isDefined(value) && envVar.match(/^JAVA_HOME_\d+_/)) {
      paths.add(value);
    }
  }

  return paths;
}

/**
 * Tries to inspect JDK configuration files for the specified JDK path which may contain proxy settings.
 *
 * @param logger The logger to use.
 * @param jdkHome The JDK home directory.
 */
export function checkJdkSettings(logger: Logger, jdkHome: string) {
  const filesToCheck = [
    // JDK 9+
    path.join("conf", "net.properties"),
    // JDK 8 and below
    path.join("lib", "net.properties"),
  ];

  // The JRE properties that may affect the proxy.
  const properties = [
    "http.proxyHost",
    "http.proxyPort",
    "https.proxyHost",
    "https.proxyPort",
    "http.nonProxyHosts",
    "java.net.useSystemProxies",
  ];

  for (const fileToCheck of filesToCheck) {
    const file = path.join(jdkHome, fileToCheck);

    try {
      if (fs.existsSync(file)) {
        logger.debug(`Found '${file}'.`);

        const lines = String(fs.readFileSync(file)).split(os.EOL);
        for (const line of lines) {
          for (const property of properties) {
            if (line.startsWith(`${property}=`)) {
              logger.info(`Found '${line}' in '${file}'.`);
            }
          }
        }
      } else {
        logger.debug(`'${file}' does not exist.`);
      }
    } catch (err) {
      logger.debug(`Failed to read '${file}': ${getErrorMessage(err)}`);
    }
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

    const jdks = discoverActionsJdks();
    for (const jdk of jdks) {
      checkJdkSettings(logger, jdk);
    }
  }
}
