import { ChildProcess, spawn } from "child_process";
import * as path from "path";

import * as core from "@actions/core";
import * as toolcache from "@actions/tool-cache";
import { pki } from "node-forge";

import * as actionsUtil from "./actions-util";
import { getActionsLogger, Logger } from "./logging";
import * as util from "./util";

const UPDATEJOB_PROXY = "update-job-proxy";
const UPDATEJOB_PROXY_VERSION = "v2.0.20240722180912";
const UPDATEJOB_PROXY_URL =
  "https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.18.1/update-job-proxy.tar.gz";
const PROXY_USER = "proxy_user";
const KEY_SIZE = 2048;
const KEY_EXPIRY_YEARS = 2;

type CertificateAuthority = {
  cert: string;
  key: string;
};

type Credential = {
  type: string;
  host?: string;
  url?: string;
  username?: string;
  password?: string;
  token?: string;
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

async function runWrapper() {
  // Make inputs accessible in the `post` step.
  actionsUtil.persistInputs();

  const logger = getActionsLogger();

  // Setup logging for the proxy
  const tempDir = actionsUtil.getTemporaryDirectory();
  const proxyLogFilePath = path.resolve(tempDir, "proxy.log");
  core.saveState("proxy-log-file", proxyLogFilePath);

  // Get the configuration options
  const credentials = getCredentials(logger);
  logger.info(
    `Credentials loaded for the following registries:\n ${credentials
      .map((c) => credentialToStr(c))
      .join("\n")}`,
  );

  const ca = generateCertificateAuthority();
  const proxyAuth = getProxyAuth();

  const proxyConfig: ProxyConfig = {
    all_credentials: credentials,
    ca,
    proxy_auth: proxyAuth,
  };

  // Start the Proxy
  const proxyBin = await getProxyBinaryPath();
  await startProxy(proxyBin, proxyConfig, proxyLogFilePath, logger);
}

async function startProxy(
  binPath: string,
  config: ProxyConfig,
  logFilePath: string,
  logger: Logger,
) {
  const host = "127.0.0.1";
  let port = 49152;
  try {
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
  } catch (error) {
    core.setFailed(`start-proxy action failed: ${util.getErrorMessage(error)}`);
  }
}

// getCredentials returns registry credentials from action inputs.
// It prefers `registries_credentials` over `registry_secrets`.
// If neither is set, it returns an empty array.
function getCredentials(logger: Logger): Credential[] {
  const registriesCredentials = actionsUtil.getOptionalInput(
    "registries_credentials",
  );
  const registrySecrets = actionsUtil.getOptionalInput("registry_secrets");

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

// getProxyAuth returns the authentication information for the proxy itself.
function getProxyAuth(): BasicAuthCredentials | undefined {
  const proxy_password = actionsUtil.getOptionalInput("proxy_password");
  if (proxy_password) {
    return {
      username: PROXY_USER,
      password: proxy_password,
    };
  }
  return;
}

async function getProxyBinaryPath(): Promise<string> {
  let proxyBin = toolcache.find(UPDATEJOB_PROXY, UPDATEJOB_PROXY_VERSION);
  if (!proxyBin) {
    const temp = await toolcache.downloadTool(UPDATEJOB_PROXY_URL);
    const extracted = await toolcache.extractTar(temp);
    proxyBin = await toolcache.cacheDir(
      extracted,
      UPDATEJOB_PROXY,
      UPDATEJOB_PROXY_VERSION,
    );
  }
  proxyBin = path.join(proxyBin, UPDATEJOB_PROXY);
  return proxyBin;
}

function credentialToStr(c: Credential): string {
  return `Type: ${c.type}; Host: ${c.host}; Url: ${c.url} Username: ${
    c.username
  }; Password: ${c.password !== undefined}; Token: ${c.token !== undefined}`;
}

void runWrapper();
