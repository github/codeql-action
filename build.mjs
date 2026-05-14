import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

/**
 * Emit a tiny stub file for each Action entrypoint. Each stub imports the shared bundle
 * and calls the respective entry point.
 *
 * @type {esbuild.Plugin}
 */
const entryPointsPlugin = {
  name: "entry-points",
  setup(build) {
    const actions = [];

    const toPascal = (s) =>
      s.replace(/(^|-)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());

    // Find the source files containing action entry points.
    build.onStart(() => {
      const actionFiles = globSync("src/*-action{,-post}.ts");
      for (const actionFile of actionFiles) {
        const match = actionFile.match(/src\/(.*)-action(-post)?.ts/);
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

    // Emit entry point stubs for each action using the entry template.
    build.onEnd(async (result) => {
      // Read the entry point template.
      const templatePath = "action-entry.js.tpl";
      const template = await readFile(join(SRC_DIR, templatePath), "utf-8");

      const makeHeader = (sourceFile) =>
        `// Automatically generated from '${templatePath}' for '${sourceFile}'.\n\n`;

      // Write entry point stubs for each action.
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
  entryPoints: globSync(["src/entry-points.ts", "src/upload-lib.ts"]),
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
