import path from "path";

/** The oldest supported major version of the CodeQL Action. */
export const OLDEST_SUPPORTED_MAJOR_VERSION = 3;

/** The `pr-checks` directory. */
export const PR_CHECKS_DIR = __dirname;

/** The path of the file configuring which checks shouldn't be required. */
export const PR_CHECK_EXCLUDED_FILE = path.join(PR_CHECKS_DIR, "excluded.yml");
