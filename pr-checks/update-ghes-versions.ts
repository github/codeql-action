#!/usr/bin/env npx tsx

/**
 * Updates src/api-compatibility.json with the current range of supported
 * GitHub Enterprise Server versions by reading the releases.json file from
 * an `enterprise-releases` checkout.
 */

import { API_COMPATIBILITY_FILE } from "./config";

function main() {}

// Only call `main` if this script was run directly.
if (require.main === module) {
  main();
}
