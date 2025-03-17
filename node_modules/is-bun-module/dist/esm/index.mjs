// src/index.ts
import semver from "semver";

// src/assets/bun-modules.json
var bun_modules_default = {
  bun: true,
  "bun:ffi": true,
  "bun:jsc": true,
  "bun:sqlite": true,
  "bun:test": true,
  "bun:wrap": true
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
  var _a;
  if (typeof moduleName !== "string") throw new TypeError("Module name must be a string");
  if (!(moduleName in modules)) return false;
  let targetBunVersion;
  if (bunVersion) {
    targetBunVersion = toSemVerStringified(bunVersion);
    if (!targetBunVersion) {
      throw new TypeError("Bun version must be a string like 1.0.0 or 'latest'");
    }
  } else {
    if (typeof process === "undefined" || !((_a = process.versions) == null ? void 0 : _a.bun)) {
      throw new Error("Bun version is not provided and cannot be detected");
    }
    targetBunVersion = process.versions.bun;
  }
  if (semver.lt(targetBunVersion, MINIMUM_BUN_VERSION)) {
    throw new RangeError(`Bun version must be at least ${MINIMUM_BUN_VERSION}`);
  }
  const versionRange = modules[moduleName];
  if (typeof versionRange === "boolean") return versionRange;
  return semver.satisfies(targetBunVersion, versionRange);
}
function toSemVerStringified(input) {
  if (typeof input !== "string") return;
  if (input === "latest") return "999.999.999";
  if (semver.valid(input)) return input;
}
export {
  MINIMUM_BUN_VERSION,
  isBunModule,
  isSupportedNodeModule
};
