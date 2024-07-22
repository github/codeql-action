"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalCacheSize = getTotalCacheSize;
const util_1 = require("./util");
/**
 * Returns the total size of all the specified paths.
 * @param paths The paths for which to calculate the total size.
 * @param logger A logger to record some informational messages to.
 * @returns The total size of all specified paths.
 */
async function getTotalCacheSize(paths, logger) {
    const sizes = await Promise.all(paths.map((cacheDir) => (0, util_1.tryGetFolderBytes)(cacheDir, logger)));
    return sizes.map((a) => a || 0).reduce((a, b) => a + b, 0);
}
//# sourceMappingURL=caching-utils.js.map