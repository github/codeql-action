import { ChildProcess, spawn as nodeSpawn } from "child_process";

import * as core from "@actions/core";

import { Logger } from "../logging";
import { ProxyConfig, ProxyInfo, Registry } from "../start-proxy";
import * as util from "../util";

const MAX_START_PROXY_ATTEMPTS = 5;
const PROXY_STARTUP_DELAY_MS = 1000;
const EPHEMERAL_PORT_MIN = 49152;
const EPHEMERAL_PORT_MAX = 65535;

type SpawnFn = typeof nodeSpawn;

function getRandomEphemeralPort(): number {
  return Math.floor(
    Math.random() * (EPHEMERAL_PORT_MAX - EPHEMERAL_PORT_MIN) +
      EPHEMERAL_PORT_MIN,
  );
}

export async function startProxy(
  binPath: string,
  config: ProxyConfig,
  logFilePath: string,
  logger: Logger,
  spawn: SpawnFn = nodeSpawn,
): Promise<ProxyInfo> {
  const host = "127.0.0.1";
  let port = EPHEMERAL_PORT_MIN;
  let subprocess: ChildProcess | undefined = undefined;
  let tries = MAX_START_PROXY_ATTEMPTS;
  let subprocessError: Error | undefined = undefined;
  let lastExitCode: number | null | undefined;

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
      subprocess = undefined;
    });
    subprocess.on("exit", (code) => {
      lastExitCode = code;
      port = getRandomEphemeralPort();
      subprocess = undefined;
    });
    subprocess.stdin?.write(JSON.stringify(config));
    subprocess.stdin?.end();

    await util.delay(PROXY_STARTUP_DELAY_MS);

    if (subprocess?.exitCode !== null && subprocess?.exitCode !== undefined) {
      lastExitCode = subprocess.exitCode;
      port = getRandomEphemeralPort();
      subprocess = undefined;
    }
  }

  if (subprocessError) {
    throw subprocessError;
  }

  if (!subprocess) {
    const baseMessage =
      `Failed to start proxy after ${MAX_START_PROXY_ATTEMPTS} attempts` +
      (lastExitCode !== undefined && lastExitCode !== null
        ? ` (last exit code: ${lastExitCode})`
        : "") +
      ".";
    throw new Error(baseMessage);
  }

  logger.info(`Proxy started on ${host}:${port}`);
  core.setOutput("proxy_host", host);
  core.setOutput("proxy_port", port.toString());
  core.setOutput("proxy_ca_certificate", config.ca.cert);

  const registryUrls: Registry[] = config.all_credentials
    .filter((credential) => credential.url !== undefined)
    .map((credential) => ({
      type: credential.type,
      url: credential.url,
    }));
  core.setOutput("proxy_urls", JSON.stringify(registryUrls));

  return { host, port, cert: config.ca.cert, registries: registryUrls };
}