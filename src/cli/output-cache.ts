import path from "path";

import { getTemporaryDirectory } from "../actions-util";

/**
 * The name of the temporary file that backs the on-disk cache of
 * CLI responses between workflow steps.
 */
const COMMAND_CACHE_FILENAME = "codeql-action-command-cache.json";

/**
 * Returns the path to the temporary file that backs the
 * on-disk cache of CLI responses between workflow steps.
 */
function getCommandCacheFilePath(): string {
  return path.join(getTemporaryDirectory(), COMMAND_CACHE_FILENAME);
}
