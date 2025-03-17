"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  MINIMUM_BUN_VERSION: () => MINIMUM_BUN_VERSION,
  isBunModule: () => isBunModule,
  isSupportedNodeModule: () => isSupportedNodeModule
});
module.exports = __toCommonJS(src_exports);
var import_semver = __toESM(require("semver"));

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
  if (import_semver.default.lt(targetBunVersion, MINIMUM_BUN_VERSION)) {
    throw new RangeError(`Bun version must be at least ${MINIMUM_BUN_VERSION}`);
  }
  const versionRange = modules[moduleName];
  if (typeof versionRange === "boolean") return versionRange;
  return import_semver.default.satisfies(targetBunVersion, versionRange);
}
function toSemVerStringified(input) {
  if (typeof input !== "string") return;
  if (input === "latest") return "999.999.999";
  if (import_semver.default.valid(input)) return input;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MINIMUM_BUN_VERSION,
  isBunModule,
  isSupportedNodeModule
});
