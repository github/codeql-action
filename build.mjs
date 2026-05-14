import { copyFile, rm, writeFile } from "node:fs/promises";
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
 * Name of the shared entrypoint file that imports each Action's code. By introducing a single
 * entrypoint for all the Actions, we avoid duplicating code across each Action's bundle.
 */
const SHARED_ENTRYPOINT = "actions-entrypoint";

/** The names of all the Action entry points (as referenced by `action.yml`s). */
function findActionNames() {
  return globSync([
    `${SRC_DIR}/*-action.ts`,
    `${SRC_DIR}/*-action-post.ts`,
  ])
    .map((p) => basename(p, ".ts"))
    .sort();
}

const ACTION_NAMES = findActionNames();

/**
 * Generate the source for the shared entry point. The generated module dispatches at runtime to the
 * Action selected by `CODEQL_ACTION_ENTRYPOINT`, using `require()` to incorporate each Action's
 * code without executing the top-level side effects.
 */
function generateEntrypointTypescriptSource() {
  const cases = ACTION_NAMES
    .map(
      (name) =>
        `  case ${JSON.stringify(name)}:\n    require("./${name}");\n    break;`,
    )
    .join("\n");
  return `const entrypoint = process.env.CODEQL_ACTION_ENTRYPOINT;
switch (entrypoint) {
${cases}
  default:
    throw new Error(
      \`Unknown CodeQL Action entrypoint: \${JSON.stringify(entrypoint)}. \` +
        "This file is intended to be invoked via the generated stubs in lib/.",
    );
}
`;
}

/**
 * Resolve the virtual shared entry point and provide its generated source to esbuild without
 * writing it to disk.
 *
 * @type {esbuild.Plugin}
 */
const virtualEntrypointPlugin = {
  name: "virtual-actions-entrypoint",
  setup(build) {
    const namespace = "actions-entrypoint";
    // Ideally, we'd `RegExp.escape` the entrypoint here, but that API isn't supported in Node 20. Since we're dealing with a hardcoded string, this isn't too much of a problem.
    build.onResolve({ filter: new RegExp(`^${SHARED_ENTRYPOINT}$`) }, () => ({
      path: SHARED_ENTRYPOINT,
      namespace,
    }));
    // Restrict using the namespace. The path filter does not need to discriminate any further.
    build.onLoad({ filter: /.*/, namespace }, () => ({
      contents: generateEntrypointTypescriptSource(),
      resolveDir: SRC_DIR,
      loader: "ts",
    }));
  },
};

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
 * Emit a tiny stub file for each Action entrypoint. Each stub sets an environment variable
 * identifying which action was invoked and then `require()`s the shared bundle, which dispatches to
 * the correct Action's code.
 *
 * @type {esbuild.Plugin}
 */
const emitActionStubsPlugin = {
  name: "emit-action-stubs",
  setup(build) {
    build.onEnd(async () => {
      await Promise.all(
        ACTION_NAMES.map(async (name) => {
          const stub =
            `"use strict";\n` +
            `process.env.CODEQL_ACTION_ENTRYPOINT = ${JSON.stringify(name)};\n` +
            `require("./${SHARED_ENTRYPOINT}.js");\n`;
          await writeFile(join(OUT_DIR, `${name}.js`), stub);
        }),
      );
    });
  },
};

const context = await esbuild.context({
  // Bundle every action together via the shared entry point. We also keep
  // `upload-lib.ts` as a separate entry point for use in testing environments.
  entryPoints: [
    { in: SHARED_ENTRYPOINT, out: SHARED_ENTRYPOINT },
    join(SRC_DIR, "upload-lib.ts"),
  ],
  bundle: true,
  format: "cjs",
  outdir: OUT_DIR,
  platform: "node",
  plugins: [
    cleanPlugin,
    copyDefaultsPlugin,
    virtualEntrypointPlugin,
    emitActionStubsPlugin,
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
