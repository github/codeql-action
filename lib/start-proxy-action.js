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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const node_forge_1 = require("node-forge");
const actionsUtil = __importStar(require("./actions-util"));
const util = __importStar(require("./util"));
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
function generatePassword(length = 20) {
    const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@-#$";
    return Array.from(crypto_1.default.randomFillSync(new Uint32Array(length)))
        .map((x) => characters[x % characters.length])
        .join("");
}
async function runWrapper() {
    const tempDir = actionsUtil.getTemporaryDirectory();
    const configFilePath = path.resolve(tempDir, "config.json");
    const input = actionsUtil.getRequiredInput("registry_secrets");
    const credentials = JSON.parse(input);
    const ca = generateCertificateAuthority();
    const proxy_password = generatePassword();
    core.setSecret(proxy_password);
    const proxyConfig = {
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
        let subprocess = undefined;
        let tries = 5;
        while (tries-- > 0 && !subprocess) {
            subprocess = (0, child_process_1.spawn)(proxyBin, ["-addr", `${host}:${port}`], {
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
    }
    catch (error) {
        core.setFailed(`start-proxy action failed: ${util.wrapError(error).message}`);
    }
    finally {
        fs.unlinkSync(configFilePath);
    }
    core.setOutput("proxy_host", host);
    core.setOutput("proxy_port", port.toString());
    core.setOutput("proxy_password", proxy_password);
    core.setOutput("proxy_ca_certificate", ca.cert);
}
void runWrapper();
//# sourceMappingURL=start-proxy-action.js.map