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

/**
 * This plugin finds all source files that contain Action entry points.
 * It then generates the virtual `entry-points` module which imports all identified files,
 * and re-exports their `runWrapper` functions with suitable aliases.
 * A tiny stub file is emitted for each Action entrypoint. Each stub imports the shared bundle
 * and calls the respective entry point.
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

      return {
        contents: `"use strict";\n${imports}\n\n${wrappers}\n`,
        resolveDir: ".",
        loader: "ts",
      };
    });

    // Emit entry point stubs for each Action using the entry template.
    build.onEnd(async (result) => {
      // Read the entry point template.
      const templatePath = "action-entry.js.tpl";
      const template = await readFile(join(SRC_DIR, templatePath), "utf-8");

      const makeHeader = (sourceFile) =>
        `// Automatically generated from '${templatePath}' for 'src/${basename(sourceFile)}'.\n\n`;

      // Write entry point stubs for each Action.
      for (const action of actions) {
        await writeFile(
          join(
            OUT_DIR,
            `${action.name}${action.isPost ? "-post" : ""}-entry.js`,
          ),
          makeHeader(action.path) +
            template.replaceAll("__ACTION__", action.pascalCaseName),
        );
      }
    });
  },
};

const context = await esbuild.context({
  // Include upload-lib.ts as an entry point for use in testing environments.
  entryPoints: [
    { in: SHARED_ENTRYPOINT, out: SHARED_ENTRYPOINT },
    join(SRC_DIR, "upload-lib.ts"),
  ],
  bundle: true,
  format: "cjs",
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
