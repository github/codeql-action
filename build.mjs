import { execFileSync } from "node:child_process";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { globSync } from "glob";

import pkg from "./package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR = join(__dirname, "src");
const OUT_DIR = join(__dirname, "lib");

/**
 * Decide whether to minify the bundle.
 *
 * We deliberately do not minify by default to avoid making every PR's regenerated bundle conflict
 * with every other PR. Instead, we minify only when building for a release branch so consumers of
 * `github/codeql-action/<action>@vN` get the smaller bundle while day-to-day development on `main`
 * stays low-churn.
 *
 * @returns {boolean}
 */
function shouldMinify() {
  const override = process.env.CODEQL_ACTION_MINIFY;
  if (override === "true") return true;
  if (override === "false") return false;

  // In `pull_request` and `merge_group` contexts, we can just look at the base ref.
  if (process.env.GITHUB_BASE_REF) {
    return process.env.GITHUB_BASE_REF.startsWith("releases/v");
  }

  // When running locally or in contexts without a base ref (e.g. `push`, `workflow_dispatch`),
  // check whether we're running as part of the release automation by looking at the local branch
  // name. Mergebacks target `main` and should not be minified, while update and backport branches
  // target release branches and should be minified.
  const localBranch = getLocalBranchName();
  if (localBranch?.startsWith("mergeback/")) return false;
  if (localBranch && /^(update|backport)-v\d/.test(localBranch)) return true;

  // If we don't seem to be running as part of the release automation, then only minify if we're on
  // a release branch.
  const refName = process.env.GITHUB_REF_NAME || localBranch;
  return !!refName && refName.startsWith("releases/v");
}

function getLocalBranchName() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Clean the output directory before building.
 *
 * @type {esbuild.Plugin}
 */
const cleanPlugin = {
  name: "clean",
  setup(build) {
    build.onStart(async () => {
      await rm(OUT_DIR, { recursive: true, force: true });
    });
  },
};

/**
 * Copy defaults.json to the output directory since other projects depend on it.
 *
 * @type {esbuild.Plugin}
 */
const copyDefaultsPlugin = {
  name: "copy-defaults",
  setup(build) {
    build.onEnd(async () => {
      await rm(join(OUT_DIR, "defaults.json"), {
        force: true,
      });
      await copyFile(
        join(SRC_DIR, "defaults.json"),
        join(OUT_DIR, "defaults.json"),
      );
    });
  },
};

/**
 * Log when the build ends.
 *
 * @type {esbuild.Plugin}
 */
const onEndPlugin = {
  name: "on-end",
  setup(build) {
    build.onEnd((result) => {
      // eslint-disable-next-line no-console
      console.log(`Build ended with ${result.errors.length} errors`);
    });
  },
};

/** The name of the virtual `entry-points` module. */
const SHARED_ENTRYPOINT = "entry-points";

/** The property name under which `upload-lib`'s namespace is exposed in `entry-points`. */
const UPLOAD_LIB_EXPORT = "uploadLib";

/** The relative source path of the `upload-lib` module that we re-export from `entry-points`. */
const UPLOAD_LIB_SRC = "./src/upload-lib";

/**
 * This plugin finds all source files that contain Action entry points. It then generates the
 * virtual `entry-points` module which imports all identified files, and re-exports their
 * `runWrapper` functions with suitable aliases.
 *
 * The virtual module additionally re-exports `upload-lib` under the `uploadLib` namespace so that
 * external consumers can access it via the small `lib/upload-lib.js` stub emitted below.
 * 
 * A tiny stub file is emitted for each Action entrypoint, and one for `upload-lib`. Each stub
 * imports the shared bundle and calls/re-exports from the respective entry point.
 *
 * @type {esbuild.Plugin}
 */
const entryPointsPlugin = {
  name: "entry-points",
  setup(build) {
    const namespace = "actions";
    const actions = [];

    const toPascal = (s) =>
      s.replace(/(^|-)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());

    // Find the source files containing Action entry points.
    build.onStart(() => {
      const actionFiles = globSync("src/*-action{,-post}.ts");
      for (const actionFile of actionFiles) {
        const match = basename(actionFile).match(/(.*)-action(-post)?/);

        if (match.length < 2) {
          throw new Error(`'${actionFile}' didn't match expected pattern.`);
        }

        const actionName = match[1];
        const isPost = match[2] !== undefined;

        actions.push({
          path: actionFile,
          name: actionName,
          isPost,
          pascalCaseName: `${toPascal(actionName)}${isPost ? "Post" : ""}Action`,
        });
      }
    });

    // Resolve the virtual `entry-points` file and set the corresponding namespace.
    // Ideally, we'd `RegExp.escape` the entrypoint here, but that API isn't supported in Node 20.
    // Since we're dealing with a hardcoded string, this isn't too much of a problem.
    build.onResolve({ filter: new RegExp(`^${SHARED_ENTRYPOINT}$`) }, () => {
      return { path: SHARED_ENTRYPOINT, namespace };
    });

    // Generate the virtual `entry-points` file based on the Actions we discovered.
    // Restrict using the namespace. The path filter does not need to discriminate any further.
    build.onLoad({ filter: /.*/, namespace }, async () => {
      const wrapperTemplatePath = "entry-wrapper.js.tpl";
      const wrapperTemplate = await readFile(
        join(SRC_DIR, wrapperTemplatePath),
        "utf-8",
      );

      const actionsSorted = actions.sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const imports = actionsSorted
        .map(
          (action) =>
            `import * as ${action.pascalCaseName} from "./src/${basename(action.path)}";`,
        )
        .join("\n");
      const wrappers = actionsSorted
        .map((action) =>
          wrapperTemplate.replaceAll("__ACTION__", action.pascalCaseName),
        )
        .join("\n\n");

      // Also re-export the `upload-lib` namespace so that external consumers can reach it
      // via the `lib/upload-lib.js` stub without us having to bundle a second copy.
      const uploadLibReExport = `export * as ${UPLOAD_LIB_EXPORT} from "${UPLOAD_LIB_SRC}";`;

      return {
        contents: `"use strict";\n${imports}\n\n${uploadLibReExport}\n\n${wrappers}\n`,
        resolveDir: ".",
        loader: "ts",
      };
    });

    // Emit entry point stubs for each Action using the entry template.
    build.onEnd(async () => {
      const makeHeader = (templatePath, sourceFile) =>
        `// Automatically generated from '${templatePath}' for 'src/${basename(sourceFile)}'.\n\n`;

      // Read the entry point template.
      const actionTemplatePath = "action-entry.js.tpl";
      const actionTemplate = await readFile(
        join(SRC_DIR, actionTemplatePath),
        "utf-8",
      );

      // Write entry point stubs for each Action.
      for (const action of actions) {
        await writeFile(
          join(
            OUT_DIR,
            `${action.name}${action.isPost ? "-post" : ""}-entry.js`,
          ),
          makeHeader(actionTemplatePath, action.path) +
            actionTemplate.replaceAll("__ACTION__", action.pascalCaseName),
        );
      }

      // Write a small stub for `upload-lib` that re-exports it from the shared bundle.
      // External callers (e.g. internal testing environments) `require("./lib/upload-lib")`
      // and expect the same shape as before, so we expose the namespace as `module.exports`.
      const uploadLibStubTemplatePath = "upload-lib-stub.js.tpl";
      const uploadLibStubTemplate = await readFile(
        join(SRC_DIR, uploadLibStubTemplatePath),
        "utf-8",
      );
      await writeFile(
        join(OUT_DIR, "upload-lib.js"),
        makeHeader(uploadLibStubTemplatePath, `${UPLOAD_LIB_SRC}.ts`) +
          uploadLibStubTemplate.replaceAll(
            "__UPLOAD_LIB_EXPORT__",
            UPLOAD_LIB_EXPORT,
          ),
      );
    });
  },
};

const minify = shouldMinify();
if (minify) {
  // eslint-disable-next-line no-console
  console.log("Minification enabled for this build.");
}

const context = await esbuild.context({
  entryPoints: [{ in: SHARED_ENTRYPOINT, out: SHARED_ENTRYPOINT }],
  bundle: true,
  format: "cjs",
  minify,
  outdir: OUT_DIR,
  platform: "node",
  external: ["./entry-points"],
  plugins: [cleanPlugin, copyDefaultsPlugin, entryPointsPlugin, onEndPlugin],
  target: ["node20"],
  define: {
    __CODEQL_ACTION_VERSION__: JSON.stringify(pkg.version),
  },
  metafile: true,
});

const result = await context.rebuild();
await writeFile(join(__dirname, "meta.json"), JSON.stringify(result.metafile));

await context.dispose();
