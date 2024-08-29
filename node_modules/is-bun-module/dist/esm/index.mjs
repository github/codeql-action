// src/index.ts
import semver from "semver";

// src/assets/bun-modules.json
var bun_modules_default = {
  bun: true,
  "bun:ffi": true,
  "bun:jsc": true,
  "bun:sqlite": true,
  "bun:test": true
};

// src/assets/node-modules.json
var node_modules_default = {
  assert: true,
  async_hooks: true,
  buffer: true,
  child_process: true,
  cluster: ">= 1.1.25",
  console: true,
  crypto: true,
  dgram: ">= 1.1.6",
  dns: true,
  domain: true,
  events: true,
  fs: true,
  http: true,
  http2: ">= 1.0.13",
  https: true,
  module: true,
  net: true,
  os: true,
  path: true,
  perf_hooks: true,
  process: true,
  punycode: true,
  querystring: true,
  readline: true,
  stream: true,
  string_decoder: true,
  sys: true,
  timers: true,
  tls: true,
  tty: true,
  url: true,
  util: true,
  vm: true,
  wasi: true,
  worker_threads: true,
  zlib: true
};

// src/index.ts
var MINIMUM_BUN_VERSION = "1.0.0";
function isBunModule(moduleName, bunVersion) {
  return checkModule(moduleName, bun_modules_default, bunVersion);
}
function isSupportedNodeModule(moduleName, bunVersion) {
  return checkModule(moduleName.replace(/^node:/, ""), node_modules_default, bunVersion);
}
function checkModule(moduleName, modules, bunVersion) {
  if (typeof moduleName !== "string") throw new TypeError("Module name must be a string");
  if (!(moduleName in modules)) return false;
  if (bunVersion != null && !isVersion(bunVersion)) {
    throw new TypeError("Bun version must be a string like 1.0.0 or 'latest' or undefined");
  }
  const targetBunVersion = bunVersion ? bunVersion === "latest" ? "999.999.999" : bunVersion : typeof process !== "undefined" && process.versions.bun;
  if (!targetBunVersion) throw "Bun version is not provided and cannot be detected";
  if (semver.lt(targetBunVersion, MINIMUM_BUN_VERSION)) {
    throw `Bun version must be at least ${MINIMUM_BUN_VERSION}`;
  }
  const versionRange = modules[moduleName];
  if (typeof versionRange === "boolean") return versionRange;
  return semver.satisfies(targetBunVersion, versionRange);
}
function isVersion(input) {
  return typeof input === "string" && (input === "latest" || Boolean(input.match(/^(?:\d+\.){2}\d+$/)));
}
export {
  MINIMUM_BUN_VERSION,
  isBunModule,
  isSupportedNodeModule
};
