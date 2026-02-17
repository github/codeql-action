import { ChildProcess, spawn } from "child_process";
import * as path from "path";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { Feature, FeatureEnablement, initFeatures } from "./feature-flags";
import { KnownLanguage } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import { getRepositoryNwo } from "./repository";
import {
  credentialToStr,
  getCredentials,
  getProxyBinaryPath,
  getSafeErrorMessage,
  parseLanguage,
  ProxyInfo,
  sendFailedStatusReport,
  sendSuccessStatusReport,
  Registry,
  ProxyConfig,
} from "./start-proxy";
import { generateCertificateAuthority } from "./start-proxy/ca";
import { checkConnections } from "./start-proxy/reachability";
import { ActionName, sendUnhandledErrorStatusReport } from "./status-report";
import * as util from "./util";

async function run(startedAt: Date) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.

  const logger = getActionsLogger();
  let features: FeatureEnablement | undefined;
  let language: KnownLanguage | undefined;

  try {
    // Make inputs accessible in the `post` step.
    actionsUtil.persistInputs();

    // Setup logging for the proxy
    const tempDir = actionsUtil.getTemporaryDirectory();
    const proxyLogFilePath = path.resolve(tempDir, "proxy.log");
    core.saveState("proxy-log-file", proxyLogFilePath);

    // Initialise FFs.
    const repositoryNwo = getRepositoryNwo();
    const gitHubVersion = await getGitHubVersion();
    features = initFeatures(
      gitHubVersion,
      repositoryNwo,
      actionsUtil.getTemporaryDirectory(),
      logger,
    );

    // Get the language input.
    const languageInput = actionsUtil.getOptionalInput("language");
    language = languageInput ? parseLanguage(languageInput) : undefined;

    // Get the registry configurations from one of the inputs.
    const credentials = getCredentials(
      logger,
      actionsUtil.getOptionalInput("registry_secrets"),
      actionsUtil.getOptionalInput("registries_credentials"),
      language,
    );

    if (credentials.length === 0) {
      logger.info("No credentials found, skipping proxy setup.");
      return;
    }

    logger.info(
      `Credentials loaded for the following registries:\n ${credentials
        .map((c) => credentialToStr(c))
        .join("\n")}`,
    );

    const ca = generateCertificateAuthority(
      await features.getValue(Feature.ImprovedProxyCertificates),
    );

    const proxyConfig: ProxyConfig = {
      all_credentials: credentials,
      ca,
    };

    // Start the Proxy
    const proxyBin = await getProxyBinaryPath(logger);
    const proxyInfo = await startProxy(
      proxyBin,
      proxyConfig,
      proxyLogFilePath,
      logger,
    );

    // Check that the private registries are reachable.
    if (await features.getValue(Feature.StartProxyConnectionChecks)) {
      await checkConnections(logger, proxyInfo);
    }

    // Report success if we have reached this point.
    await sendSuccessStatusReport(
      startedAt,
      {
        languages: language && [language],
      },
      proxyConfig.all_credentials.map((c) => c.type),
      logger,
    );
  } catch (unwrappedError) {
    await sendFailedStatusReport(logger, startedAt, language, unwrappedError);
  }
}

async function runWrapper() {
  const startedAt = new Date();
  const logger = getActionsLogger();

  try {
    await run(startedAt);
  } catch (error) {
    core.setFailed(`start-proxy action failed: ${util.getErrorMessage(error)}`);
    await sendUnhandledErrorStatusReport(
      ActionName.StartProxy,
      startedAt,
      getSafeErrorMessage(util.wrapError(error)),
      logger,
    );
  }
}

async function startProxy(
  binPath: string,
  config: ProxyConfig,
  logFilePath: string,
  logger: Logger,
): Promise<ProxyInfo> {
  const host = "127.0.0.1";
  let port = 49152;
  let subprocess: ChildProcess | undefined = undefined;
  let tries = 5;
  let subprocessError: Error | undefined = undefined;
  while (tries-- > 0 && !subprocess && !subprocessError) {
    subprocess = spawn(
      binPath,
      ["-addr", `${host}:${port}`, "-config", "-", "-logfile", logFilePath],
      {
        detached: true,
        stdio: ["pipe", "ignore", "ignore"],
      },
    );
    subprocess.unref();
    if (subprocess.pid) {
      core.saveState("proxy-process-pid", `${subprocess.pid}`);
    }
    subprocess.on("error", (error) => {
      subprocessError = error;
    });
    subprocess.on("exit", (code) => {
      if (code !== 0) {
        // If the proxy failed to start, try a different port from the ephemeral range [49152, 65535]
        port = Math.floor(Math.random() * (65535 - 49152) + 49152);
        subprocess = undefined;
      }
    });
    subprocess.stdin?.write(JSON.stringify(config));
    subprocess.stdin?.end();
    // Wait a little to allow the proxy to start
    await util.delay(1000);
  }
  if (subprocessError) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw subprocessError;
  }
  logger.info(`Proxy started on ${host}:${port}`);
  core.setOutput("proxy_host", host);
  core.setOutput("proxy_port", port.toString());
  core.setOutput("proxy_ca_certificate", config.ca.cert);

  const registry_urls: Registry[] = config.all_credentials
    .filter((credential) => credential.url !== undefined)
    .map((credential) => ({
      type: credential.type,
      url: credential.url,
    }));
  core.setOutput("proxy_urls", JSON.stringify(registry_urls));

  return { host, port, cert: config.ca.cert, registries: registry_urls };
}

void runWrapper();
