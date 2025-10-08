import { ChildProcess, spawn } from "child_process";
import * as path from "path";

import * as core from "@actions/core";
import * as toolcache from "@actions/tool-cache";
import { pki } from "node-forge";

import * as actionsUtil from "./actions-util";
import { getApiDetails, getAuthorizationHeaderFor } from "./api-client";
import { Config } from "./config-utils";
import { KnownLanguage } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import {
  Credential,
  getCredentials,
  getDownloadUrl,
  parseLanguage,
  UPDATEJOB_PROXY,
} from "./start-proxy";
import {
  ActionName,
  createStatusReportBase,
  getActionsStatus,
  sendStatusReport,
  StatusReportBase,
} from "./status-report";
import * as util from "./util";

const KEY_SIZE = 2048;
const KEY_EXPIRY_YEARS = 2;

type CertificateAuthority = {
  cert: string;
  key: string;
};

type BasicAuthCredentials = {
  username: string;
  password: string;
};

type ProxyConfig = {
  all_credentials: Credential[];
  ca: CertificateAuthority;
  proxy_auth?: BasicAuthCredentials;
};

const CERT_SUBJECT = [
  {
    name: "commonName",
    value: "Dependabot Internal CA",
  },
  {
    name: "organizationName",
    value: "GitHub inc.",
  },
  {
    shortName: "OU",
    value: "Dependabot",
  },
  {
    name: "countryName",
    value: "US",
  },
  {
    shortName: "ST",
    value: "California",
  },
  {
    name: "localityName",
    value: "San Francisco",
  },
];

function generateCertificateAuthority(): CertificateAuthority {
  const keys = pki.rsa.generateKeyPair(KEY_SIZE);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + KEY_EXPIRY_YEARS,
  );

  cert.setSubject(CERT_SUBJECT);
  cert.setIssuer(CERT_SUBJECT);
  cert.setExtensions([{ name: "basicConstraints", cA: true }]);
  cert.sign(keys.privateKey);

  const pem = pki.certificateToPem(cert);
  const key = pki.privateKeyToPem(keys.privateKey);
  return { cert: pem, key };
}

interface StartProxyStatus extends StatusReportBase {
  // A comma-separated list of registry types which are configured for CodeQL.
  // This only includes registry types we support, not all that are configured.
  registry_types: string;
}

async function sendSuccessStatusReport(
  startedAt: Date,
  config: Partial<Config>,
  registry_types: string[],
  logger: Logger,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.StartProxy,
    "success",
    startedAt,
    config,
    await util.checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: StartProxyStatus = {
      ...statusReportBase,
      registry_types: registry_types.join(","),
    };
    await sendStatusReport(statusReport);
  }
}

async function runWrapper() {
  const startedAt = new Date();

  // Make inputs accessible in the `post` step.
  actionsUtil.persistInputs();

  const logger = getActionsLogger();
  let language: KnownLanguage | undefined;

  try {
    // Setup logging for the proxy
    const tempDir = actionsUtil.getTemporaryDirectory();
    const proxyLogFilePath = path.resolve(tempDir, "proxy.log");
    core.saveState("proxy-log-file", proxyLogFilePath);

    // Get the configuration options
    const languageInput = actionsUtil.getOptionalInput("language");
    language = languageInput ? parseLanguage(languageInput) : undefined;
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

    const ca = generateCertificateAuthority();

    const proxyConfig: ProxyConfig = {
      all_credentials: credentials,
      ca,
    };

    // Start the Proxy
    const proxyBin = await getProxyBinaryPath(logger);
    await startProxy(proxyBin, proxyConfig, proxyLogFilePath, logger);

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
    const error = util.wrapError(unwrappedError);
    core.setFailed(`start-proxy action failed: ${error.message}`);

    // We skip sending the error message and stack trace here to avoid the possibility
    // of leaking any sensitive information into the telemetry.
    const errorStatusReportBase = await createStatusReportBase(
      ActionName.StartProxy,
      getActionsStatus(error),
      startedAt,
      {
        languages: language && [language],
      },
      await util.checkDiskUsage(logger),
      logger,
    );
    if (errorStatusReportBase !== undefined) {
      await sendStatusReport(errorStatusReportBase);
    }
  }
}

async function startProxy(
  binPath: string,
  config: ProxyConfig,
  logFilePath: string,
  logger: Logger,
) {
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

  const registry_urls = config.all_credentials
    .filter((credential) => credential.url !== undefined)
    .map((credential) => ({
      type: credential.type,
      url: credential.url,
    }));
  core.setOutput("proxy_urls", JSON.stringify(registry_urls));
}

async function getProxyBinaryPath(logger: Logger): Promise<string> {
  const proxyFileName =
    process.platform === "win32" ? `${UPDATEJOB_PROXY}.exe` : UPDATEJOB_PROXY;
  const proxyInfo = await getDownloadUrl(logger);

  let proxyBin = toolcache.find(proxyFileName, proxyInfo.version);
  if (!proxyBin) {
    const apiDetails = getApiDetails();
    const authorization = getAuthorizationHeaderFor(
      logger,
      apiDetails,
      proxyInfo.url,
    );
    const temp = await toolcache.downloadTool(
      proxyInfo.url,
      undefined,
      authorization,
      {
        accept: "application/octet-stream",
      },
    );
    const extracted = await toolcache.extractTar(temp);
    proxyBin = await toolcache.cacheDir(
      extracted,
      proxyFileName,
      proxyInfo.version,
    );
  }
  proxyBin = path.join(proxyBin, proxyFileName);
  return proxyBin;
}

function credentialToStr(c: Credential): string {
  return `Type: ${c.type}; Host: ${c.host}; Url: ${c.url} Username: ${
    c.username
  }; Password: ${c.password !== undefined}; Token: ${c.token !== undefined}`;
}

void runWrapper();
