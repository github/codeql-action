/*
 * We perform enablement checks for overlay analysis to avoid using it on runners that are too small
 * to support it. However these checks cannot avoid every potential issue without being overly
 * conservative. Therefore, if our enablement checks enable overlay analysis for a runner that is
 * too small, we want to remember that, so that we will not try to use overlay analysis until
 * something changes (e.g. a larger runner is provisioned, or a new CodeQL version is released).
 *
 * We use the Actions cache as a lightweight way of providing this functionality.
 */

import { type CodeQL } from "../codeql";
import { DiskUsage } from "../util";

export async function getCacheKey(
  codeql: CodeQL,
  language: string,
  diskUsage: DiskUsage,
): Promise<string> {
  // Total disk space, rounded to the nearest 10 GB. This is included in the cache key so that if a
  // customer upgrades their runner, we will try again to use overlay analysis, even if the CodeQL
  // version has not changed. We round to the nearest 10 GB to work around small differences in disk
  // space.
  //
  // Limitation: this can still flip from "too small" to "large enough" and back again if the disk
  // space fluctuates above and below a multiple of 10 GB.
  const diskSpaceToNearest10Gb = `${10 * Math.floor(diskUsage.numTotalBytes / (10 * 1024 * 1024 * 1024))}GB`;

  // Include the CodeQL version in the cache key so we will try again to use overlay analysis when
  // new queries and libraries that may be more efficient are released.
  return `codeql-overlay-status-${language}-${(await codeql.getVersion()).version}-runner-${diskSpaceToNearest10Gb}`;
}
