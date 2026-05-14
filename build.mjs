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
 * Mark `lib/` as an ESM scope by writing `lib/package.json` with
 * `{ "type": "module" }`. This lets the bundles use the regular `.js`
 * extension while still being loaded as ESM by Node, without affecting
 * the rest of the repo (the root package.json stays CJS so the tsc
 * output in `build/` and any other consumers are unchanged).
 *
 * @type {esbuild.Plugin}
 */
const writeLibPackageJsonPlugin = {
  name: "write-lib-package-json",
  setup(build) {
    build.onEnd(async () => {
      await writeFile(
        join(OUT_DIR, "package.json"),
        JSON.stringify({ type: "module" }) + "\n",
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

// Banner injected into every emitted ESM file so that bundled CommonJS
// dependencies which call `require(...)` at runtime (e.g. parts of the
// Azure SDK + undici stack pulled in transitively by `@actions/cache` and
// `@actions/artifact`), or read `__filename` / `__dirname`, keep working.
const esmCompatBanner = [
  `import { createRequire as __codeqlCreateRequire } from "module";`,
  `import { fileURLToPath as __codeqlFileURLToPath } from "url";`,
  `import { dirname as __codeqlDirname } from "path";`,
  `var require = __codeqlCreateRequire(import.meta.url);`,
  `var __filename = __codeqlFileURLToPath(import.meta.url);`,
  `var __dirname = __codeqlDirname(__filename);`,
].join("");

const context = await esbuild.context({
  // Include upload-lib.ts as an entry point for use in testing environments.
  entryPoints: globSync([
    `${SRC_DIR}/*-action.ts`,
    `${SRC_DIR}/*-action-post.ts`,
    "src/upload-lib.ts",
  ]),
  bundle: true,
  // Use ESM with code splitting so shared modules (Azure storage, undici,
  // octokit, ...) live in shared chunk files instead of being duplicated
  // into every entry bundle. Node treats these `.js` files as ESM because
  // `writeLibPackageJsonPlugin` writes `lib/package.json` with
  // `"type": "module"`.
  format: "esm",
  splitting: true,
  minify: true,
  chunkNames: "chunks/chunk-[hash]",
  banner: { js: esmCompatBanner },
  outdir: OUT_DIR,
  platform: "node",
  plugins: [
    cleanPlugin,
    copyDefaultsPlugin,
    writeLibPackageJsonPlugin,
    onEndPlugin,
  ],
  target: ["node20"],
  define: {
    __CODEQL_ACTION_VERSION__: JSON.stringify(pkg.version),
  },
  metafile: true,
});

const result = await context.rebuild();
await writeFile(join(__dirname, "meta.json"), JSON.stringify(result.metafile));

await context.dispose();
