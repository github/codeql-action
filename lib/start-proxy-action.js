"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const toolcache = __importStar(require("@actions/tool-cache"));
const node_forge_1 = require("node-forge");
const actionsUtil = __importStar(require("./actions-util"));
const util = __importStar(require("./util"));
const UPDATEJOB_PROXY = "update-job-proxy";
const UPDATEJOB_PROXY_VERSION = "v2.0.20240722180912";
const UPDATEJOB_PROXY_URL = "https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.18.1/update-job-proxy.tar.gz";
const PROXY_USER = "proxy_user";
const KEY_SIZE = 2048;
const KEY_EXPIRY_YEARS = 2;
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
function generateCertificateAuthority() {
    const keys = node_forge_1.pki.rsa.generateKeyPair(KEY_SIZE);
    const cert = node_forge_1.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + KEY_EXPIRY_YEARS);
    cert.setSubject(CERT_SUBJECT);
    cert.setIssuer(CERT_SUBJECT);
    cert.setExtensions([{ name: "basicConstraints", cA: true }]);
    cert.sign(keys.privateKey);
    const pem = node_forge_1.pki.certificateToPem(cert);
    const key = node_forge_1.pki.privateKeyToPem(keys.privateKey);
    return { cert: pem, key };
}
async function runWrapper() {
    const tempDir = actionsUtil.getTemporaryDirectory();
    const logFilePath = path.resolve(tempDir, "proxy.log");
    const input = actionsUtil.getOptionalInput("registry_secrets") || "[]";
    const credentials = JSON.parse(input);
    const ca = generateCertificateAuthority();
    const proxy_password = actionsUtil.getOptionalInput("proxy_password");
    core.saveState("proxy-log-file", logFilePath);
    let proxy_auth = undefined;
    if (proxy_password) {
        core.setSecret(proxy_password);
        proxy_auth = {
            username: PROXY_USER,
            password: proxy_password,
        };
    }
    const proxyConfig = {
        all_credentials: credentials,
        ca,
        proxy_auth,
    };
    const host = "127.0.0.1";
    let proxyBin = toolcache.find(UPDATEJOB_PROXY, UPDATEJOB_PROXY_VERSION);
    if (!proxyBin) {
        const temp = await toolcache.downloadTool(UPDATEJOB_PROXY_URL);
        const extracted = await toolcache.extractTar(temp);
        proxyBin = await toolcache.cacheDir(extracted, UPDATEJOB_PROXY, UPDATEJOB_PROXY_VERSION);
    }
    proxyBin = path.join(proxyBin, UPDATEJOB_PROXY);
    let port = 49152;
    try {
        let subprocess = undefined;
        let tries = 5;
        let subprocessError = undefined;
        while (tries-- > 0 && !subprocess && !subprocessError) {
            subprocess = (0, child_process_1.spawn)(proxyBin, ["-addr", `${host}:${port}`, "-config", "-", "-logfile", logFilePath], {
                detached: true,
                stdio: ["pipe", "ignore", "ignore"],
            });
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
    }
    catch (error) {
        core.setFailed(`start-proxy action failed: ${util.wrapError(error).message}`);
    }
}
void runWrapper();
//# sourceMappingURL=start-proxy-action.js.map