import path from "path";

/** The oldest supported major version of the CodeQL Action. */
export const OLDEST_SUPPORTED_MAJOR_VERSION = 3;

/** The `pr-checks` directory. */
export const PR_CHECKS_DIR = __dirname;

/** The path of the file configuring which checks shouldn't be required. */
export const PR_CHECK_EXCLUDED_FILE = path.join(PR_CHECKS_DIR, "excluded.yml");

/** The path to the esbuild metadata file. */
export const BUNDLE_METADATA_FILE = path.join(
  PR_CHECKS_DIR,
  "..",
  "build-metadata.json",
);

/** The path of the baseline esbuild metadata file, once extracted from a workflow artifact. */
export const BASELINE_BUNDLE_METADATA_FILE = path.join(
  PR_CHECKS_DIR,
  "build-metadata.json",
);

/** The `src` directory. */
const SOURCE_ROOT = path.join(PR_CHECKS_DIR, "..", "src");

/** The path to the built-in languages file. */
export const BUILTIN_LANGUAGES_FILE = path.join(
  SOURCE_ROOT,
  "languages",
  "builtin.json",
);
