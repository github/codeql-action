import * as https from "https";

import { HttpsProxyAgent } from "https-proxy-agent";

import { Logger } from "../logging";
import { getErrorMessage } from "../util";

import { getAddressString, ProxyInfo, Registry } from "./types";

/** Represents registry-specific connection test configurations. */
export interface ConnectionTestConfig {
  /** An optional path to append to the end of the base url. */
  path?: string;
}

/** A partial mapping of registry types to extra connection test configurations. */
export const connectionTestConfig: Partial<
  Record<string, ConnectionTestConfig>
> = {
  nuget_feed: { path: "v3/index.json" },
};

/**
 * Applies the registry-specific check configuration to the base URL, if any and applicable.
 */
export function makeTestUrl(
  config: ConnectionTestConfig | undefined,
  base: URL,
): URL {
  if (config?.path === undefined) {
    return base;
  }
  if (base.pathname.endsWith(config.path)) {
    return base;
  }
  return new URL(config.path, base);
}

export class ReachabilityError extends Error {
  constructor(public readonly statusCode?: number | undefined) {
    super();
  }
}

/**
 * Abstracts over the backend for the reachability checks,
 * to allow actual networking to be replaced with stubs.
 */
export interface ReachabilityBackend {
  /**
   * Performs a test HTTP request to the specified `url`. Resolves to the status code,
   * if a successful status code was obtained. Otherwise throws
   *
   * @param url The URL of the registry to try and reach.
   * @returns The successful status code (in the `<400` range).
   */
  checkConnection: (url: URL) => Promise<number>;
}

class NetworkReachabilityBackend implements ReachabilityBackend {
  private agent: https.Agent;

  constructor(private readonly proxy: ProxyInfo) {
    this.agent = new HttpsProxyAgent(`http://${proxy.host}:${proxy.port}`);
  }

  public async checkConnection(url: URL): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          agent: this.agent,
          method: "GET",
          ca: this.proxy.cert,
          timeout: 5 * 1000, // 5 seconds
        },
        (res) => {
          res.destroy();

          if (res.statusCode !== undefined && res.statusCode < 400) {
            resolve(res.statusCode);
          } else {
            reject(new ReachabilityError(res.statusCode));
          }
        },
      );
      req.on("error", (e) => {
        reject(e);
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Connection timeout."));
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
): Promise<Set<Registry>> {
  const result: Set<Registry> = new Set();

  // Don't do anything if there are no registries.
  if (proxy.registries.length === 0) return result;

  try {
    // Initialise a networking backend if no backend was provided.
    if (backend === undefined) {
      backend = new NetworkReachabilityBackend(proxy);
    }

    for (const registry of proxy.registries) {
      const config = connectionTestConfig[registry.type];
      const address = getAddressString(registry);
      const url = URL.parse(address);

      if (url === null) {
        logger.info(
          `Skipping check for ${address} since it is not a valid URL.`,
        );
        continue;
      }

      const testUrl = makeTestUrl(config, url);

      try {
        logger.debug(`Testing connection to ${url}...`);
        const statusCode = await backend.checkConnection(testUrl);

        logger.info(`Successfully tested connection to ${url} (${statusCode})`);
        result.add(registry);
      } catch (e) {
        if (e instanceof ReachabilityError && e.statusCode !== undefined) {
          logger.info(`Connection test to ${url} failed. (${e.statusCode})`);
        } else {
          logger.warning(
            `Connection test to ${url} failed: ${getErrorMessage(e)}`,
          );
        }
      }
    }

    logger.debug(`Finished testing connections to private registries.`);
  } catch (e) {
    logger.warning(
      `Failed to test connections to private registries: ${getErrorMessage(e)}`,
    );
  }

  return result;
}
