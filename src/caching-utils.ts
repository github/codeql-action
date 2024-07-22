import { Logger } from "./logging";
import { tryGetFolderBytes } from "./util";

/**
 * Returns the total size of all the specified paths.
 * @param paths The paths for which to calculate the total size.
 * @param logger A logger to record some informational messages to.
 * @returns The total size of all specified paths.
 */
export async function getTotalCacheSize(
  paths: string[],
  logger: Logger,
): Promise<number> {
  const sizes = await Promise.all(
    paths.map((cacheDir) => tryGetFolderBytes(cacheDir, logger)),
  );
  return sizes.map((a) => a || 0).reduce((a, b) => a + b, 0);
}
