import path from "path";

/** The oldest supported major version of the CodeQL Action. */
export const OLDEST_SUPPORTED_MAJOR_VERSION = 3;

/** The `pr-checks` directory. */
export const PR_CHECKS_DIR = __dirname;

/** The repository root. */
export const REPO_ROOT = path.join(PR_CHECKS_DIR, "..");

/** The path of the file configuring which checks shouldn't be required. */
export const PR_CHECK_EXCLUDED_FILE = path.join(PR_CHECKS_DIR, "excluded.yml");

/** The path of the main `package.json`. */
export const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

/** The path to the esbuild metadata file. */
export const BUNDLE_METADATA_FILE = path.join(REPO_ROOT, "meta.json");

/** The `src` directory. */
const SOURCE_ROOT = path.join(REPO_ROOT, "src");

/** The path to the built-in languages file. */
export const BUILTIN_LANGUAGES_FILE = path.join(
  SOURCE_ROOT,
  "languages",
  "builtin.json",
);

/** Path to the api-compatibility.json file. */
export const API_COMPATIBILITY_FILE = path.join(
  SOURCE_ROOT,
  "api-compatibility.json",
);
