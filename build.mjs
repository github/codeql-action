import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { globSync } from "glob";
import { copy } from "esbuild-plugin-copy";
import { typecheckPlugin } from "@jgoz/esbuild-plugin-typecheck";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = "lib";

await rm(join(__dirname, OUT_DIR), { recursive: true, force: true });

// This will just log when a build ends
/** @type {esbuild.Plugin} */
const onEndPlugin = {
  name: "on-end",
  setup(build) {
    build.onEnd((result) => {
      // eslint-disable-next-line no-console
      console.log(`Build ended with ${result.errors.length} errors`);
    });
  },
};

const copyDefaults = copy({
  assets: {
    from: ["src/defaults.json"],
    to: ["defaults.json"],
  },
});

const context = await esbuild.context({
  entryPoints: globSync(["src/*-action.ts", "src/*-action-post.ts"]),
  bundle: true,
  format: "cjs",
  outdir: OUT_DIR,
  platform: "node",
  plugins: [typecheckPlugin(), copyDefaults, onEndPlugin],
});

await context.rebuild();
await context.dispose();
