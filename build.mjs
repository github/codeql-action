import { copyFile, rm, writeFile } from "node:fs/promises";
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

const context = await esbuild.context({
  // Include upload-lib.ts as an entry point for use in testing environments.
  entryPoints: globSync([
    `${SRC_DIR}/*-action.ts`,
    `${SRC_DIR}/*-action-post.ts`,
    "src/upload-lib.ts",
  ]),
  bundle: true,
  format: "cjs",
  outdir: OUT_DIR,
  platform: "node",
  plugins: [cleanPlugin, copyDefaultsPlugin, onEndPlugin],
  target: ["node20"],
  define: {
    __CODEQL_ACTION_VERSION__: JSON.stringify(pkg.version),
  },
  metafile: true,
});

const result = await context.rebuild();
await writeFile(join(__dirname, "meta.json"), JSON.stringify(result.metafile));

await context.dispose();
