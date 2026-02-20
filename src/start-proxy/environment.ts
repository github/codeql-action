import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";

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
    const url = URL.parse(value);
    if (isDefined(url)) {
      url.username = "";
      url.password = "";
      logger.info(`Environment variable '${name}' is set to '${url}'.`);
    } else {
      logger.info(`Environment variable '${name}' is set to '${value}'.`);
    }
    return true;
  } else {
    logger.debug(`Environment variable '${name}' is not set.`);
    return false;
  }
}

// The JRE properties that may affect the proxy.
const javaProperties = [
  "http.proxyHost",
  "http.proxyPort",
  "https.proxyHost",
  "https.proxyPort",
  "http.nonProxyHosts",
  "java.net.useSystemProxies",
  "javax.net.ssl.trustStore",
  "javax.net.ssl.trustStoreType",
  "javax.net.ssl.trustStoreProvider",
  "jdk.tls.client.protocols",
  "jdk.tls.disabledAlgorithms",
  "jdk.security.allowNonCaAnchor",
  "https.protocols",
  "com.sun.net.ssl.enableAIAcaIssuers",
  "com.sun.net.ssl.checkRevocation",
  "com.sun.security.enableCRLDP",
  "ocsp.enable",
];

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
 * Discovers paths to JDK directories based on JAVA_HOME and GHA-specific environment variables.
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

  for (const fileToCheck of filesToCheck) {
    const file = path.join(jdkHome, fileToCheck);

    try {
      if (fs.existsSync(file)) {
        logger.debug(`Found '${file}'.`);

        const lines = String(fs.readFileSync(file)).split("\n");
        for (const line of lines) {
          for (const property of javaProperties) {
            if (line.startsWith(`${property}=`)) {
              logger.info(`Found '${line.trimEnd()}' in '${file}'.`);
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

/** Invokes `java` to get it to show us the active configuration. */
async function showJavaSettings(logger: Logger): Promise<void> {
  try {
    const java = await io.which("java", true);

    let output = "";
    await new toolrunner.ToolRunner(
      java,
      ["-XshowSettings:all", "-XshowSettings:security:all", "-version"],
      {
        silent: true,
        listeners: {
          stdout: (data) => {
            output += String(data);
          },
          stderr: (data) => {
            output += String(data);
          },
        },
      },
    ).exec();

    logger.startGroup("Java settings");
    logger.info(output);
    logger.endGroup();
  } catch (err) {
    logger.debug(`Failed to query java settings: ${getErrorMessage(err)}`);
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
export async function checkProxyEnvironment(
  logger: Logger,
  language: Language | undefined,
): Promise<void> {
  // Determine whether there is an existing proxy configured.
  checkProxyEnvVars(logger);

  // Check language-specific configurations. If we don't know the language,
  // then we perform all checks.
  if (language === undefined || language === KnownLanguage.java) {
    checkJavaEnvVars(logger);

    await showJavaSettings(logger);

    const jdks = discoverActionsJdks();
    for (const jdk of jdks) {
      checkJdkSettings(logger, jdk);
    }
  }
}
