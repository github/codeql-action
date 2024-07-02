import { ChildProcess, spawn } from "child_process";
import crypto from "crypto";
import * as fs from "fs";
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
    value: "GitHub ic.",
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

function generatePassword(length: number = 20): string {
  const characters =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@-#$";

  return Array.from(crypto.randomFillSync(new Uint32Array(length)))
    .map((x) => characters[x % characters.length])
    .join("");
}
async function runWrapper() {
  const tempDir = actionsUtil.getTemporaryDirectory();
  const configFilePath = path.resolve(tempDir, "config.json");
  const input = actionsUtil.getRequiredInput("registry_secrets");
  const credentials = JSON.parse(input) as Credential[];
  const ca = generateCertificateAuthority();
  const proxy_password = generatePassword();
  core.setSecret(proxy_password);
  const proxyConfig: ProxyConfig = {
    all_credentials: credentials,
    ca,
    proxy_auth: {
      username: PROXY_USER,
      password: proxy_password,
    },
  };
  const host = "127.0.0.1";
  const proxyBin = path.resolve(__dirname, "update-job-proxy");
  let port = 49152;
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(proxyConfig));

    let subprocess: ChildProcess | undefined = undefined;
    let tries = 5;
    while (tries-- > 0 && !subprocess) {
      subprocess = spawn(proxyBin, ["-addr", `${host}:${port}`], {
        cwd: tempDir,
        detached: true,
        stdio: "ignore",
      });
      subprocess.on("exit", (code) => {
        if (code !== 0) {
          port = Math.random() * (65535 - 49152) + 49152;
          subprocess = undefined;
        }
      });
      core.saveState("proxy-process-pid", `${subprocess.pid}`);
      subprocess.unref();
      // Wait a little to allow the proxy to start
      await util.delay(1000, { allowProcessExit: true });
    }
  } catch (error) {
    core.setFailed(
      `start-proxy action failed: ${util.wrapError(error).message}`,
    );
  } finally {
    fs.unlinkSync(configFilePath);
  }
  core.setOutput("proxy_host", host);
  core.setOutput("proxy_port", port.toString());
  core.setOutput("proxy_password", proxy_password);
  core.setOutput("proxy_ca_certificate", ca.cert);
}

void runWrapper();
