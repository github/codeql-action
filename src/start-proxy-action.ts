import { ChildProcess, spawn } from "child_process";
import * as path from "path";

import * as core from "@actions/core";
import { pki } from "node-forge";

import * as actionsUtil from "./actions-util";
import * as util from "./util";

const PROXY_USER = "proxy_user";
const KEY_SIZE = 2048;
const KEY_EXPIRY_YEARS = 2;

export type CertificateAuthority = {
  cert: string;
  key: string;
};

export type Credential = {
  type: string;
  host: string;
  username?: string;
  password?: string;
  token?: string;
};

export type BasicAuthCredentials = {
  username: string;
  password: string;
};

export type ProxyConfig = {
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
  const tempDir = actionsUtil.getTemporaryDirectory();
  const logFilePath = path.resolve(tempDir, "proxy.log");
  const input = actionsUtil.getOptionalInput("registry_secrets") || "[]";
  const credentials = JSON.parse(input) as Credential[];
  const ca = generateCertificateAuthority();
  const proxy_password = actionsUtil.getOptionalInput("proxy_password");
  core.saveState("proxy-log-file", logFilePath);

  let proxy_auth: BasicAuthCredentials | undefined = undefined;
  if (proxy_password) {
    core.setSecret(proxy_password);
    proxy_auth = {
      username: PROXY_USER,
      password: proxy_password,
    };
  }
  const proxyConfig: ProxyConfig = {
    all_credentials: credentials,
    ca,
    proxy_auth,
  };
  const host = "127.0.0.1";
  const proxyBin = path.resolve(__dirname, "..", "bin", "update-job-proxy");
  let port = 49152;
  try {
    let subprocess: ChildProcess | undefined = undefined;
    let tries = 5;
    let subprocessError: Error | undefined = undefined;
    while (tries-- > 0 && !subprocess && !subprocessError) {
      subprocess = spawn(
        proxyBin,
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
      subprocess.stdin?.write(JSON.stringify(proxyConfig));
      subprocess.stdin?.end();
      // Wait a little to allow the proxy to start
      await util.delay(1000);
    }
    if (subprocessError) {
      throw subprocessError;
    }
    core.info(`Proxy started on ${host}:${port}`);
    core.setOutput("proxy_host", host);
    core.setOutput("proxy_port", port.toString());
    core.setOutput("proxy_ca_certificate", ca.cert);
  } catch (error) {
    core.setFailed(
      `start-proxy action failed: ${util.wrapError(error).message}`,
    );
  }
}

void runWrapper();
