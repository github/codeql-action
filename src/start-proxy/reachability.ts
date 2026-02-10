import * as https from "https";

import { HttpsProxyAgent } from "https-proxy-agent";

import { Logger } from "../logging";
import { getErrorMessage } from "../util";

import { getAddressString, ProxyInfo, Registry, ValidRegistry } from "./types";

export class ReachabilityError extends Error {
  constructor(
    public readonly registry: Registry,
    public readonly statusCode?: number | undefined,
  ) {
    const statusStr = ReachabilityError.getStatusStr(statusCode);
    super(`Connection test to ${registry.url} failed.${statusStr}`);
  }

  private static getStatusStr(statusCode: number | undefined) {
    if (statusCode === undefined) return "";
    return ` (${statusCode})`;
  }
}

/**
 * Abstracts over the backend for the reachability checks,
 * to allow actual networking to be replaced with stubs.
 */
export interface ReachabilityBackend {
  /**
   * Performs a test HTTP request to the specified `registry`. Resolves to the status code,
   * if a successful status code was obtained. Otherwise throws
   *
   * @param registry The registry to try and reach.
   * @returns The successful status code (in the `<400` range).
   */
  checkConnection: (registry: ValidRegistry) => Promise<number>;
}

class NetworkReachabilityBackend implements ReachabilityBackend {
  private agent: https.Agent;

  constructor(
    private readonly logger: Logger,
    private readonly proxy: ProxyInfo,
  ) {
    this.agent = new HttpsProxyAgent(`http://${proxy.host}:${proxy.port}`);
  }

  public async checkConnection(registry: ValidRegistry): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        getAddressString(registry),
        {
          agent: this.agent,
          method: "HEAD",
          ca: this.proxy.cert,
          timeout: 5 * 1000, // 5 seconds
        },
        (res) => {
          res.destroy();

          if (res.statusCode !== undefined && res.statusCode < 400) {
            resolve(res.statusCode);
          } else {
            reject(new ReachabilityError(registry, res.statusCode));
          }
        },
      );
      req.on("error", (e) => {
        this.logger.error(e);
        reject(new ReachabilityError(registry));
      });
      req.end();
    });
  }
}

/**
 * Determines which configured registries can be reached by performing test requests to them.
 *
 * @param logger The logger to use.
 * @param proxy Information about the proxy, including the configured registries.
 * @param backend Optionally for testing, a `ReachabilityBackend` to use.
 * @returns The set of registries which passed the checks.
 */
export async function checkConnections(
  logger: Logger,
  proxy: ProxyInfo,
  backend?: ReachabilityBackend,
): Promise<Set<ValidRegistry>> {
  const result: Set<ValidRegistry> = new Set();

  // Don't do anything if there are no registries.
  if (proxy.registries.length === 0) return result;

  try {
    // Initialise a networking backend if no backend was provided.
    if (backend === undefined) {
      backend = new NetworkReachabilityBackend(logger, proxy);
    }

    for (const registry of proxy.registries) {
      const address = getAddressString(registry);
      try {
        logger.debug(`Testing connection to ${address}...`);
        const statusCode = await backend.checkConnection(registry);

        logger.info(
          `Successfully tested connection to ${address} (${statusCode})`,
        );
        result.add(registry);
      } catch (e) {
        if (e instanceof ReachabilityError && e.statusCode !== undefined) {
          logger.error(
            `Connection test to ${address} failed. (${e.statusCode})`,
          );
        } else {
          logger.error(
            `Connection test to ${address} failed: ${getErrorMessage(e)}`,
          );
        }
      }
    }

    logger.debug(`Finished testing connections to private registries.`);
  } catch (e) {
    logger.error(
      `Failed to test connections to private registries: ${getErrorMessage(e)}`,
    );
  }

  return result;
}
