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
  convertPathToPattern: () => convertPathToPattern,
  escapePath: () => escapePath,
  glob: () => glob,
  globSync: () => globSync,
  isDynamicPattern: () => isDynamicPattern
});
module.exports = __toCommonJS(src_exports);
var import_node_path = __toESM(require("path"));
var import_fdir = require("fdir");
var import_picomatch2 = __toESM(require("picomatch"));

// src/utils.ts
var import_picomatch = __toESM(require("picomatch"));
var ESCAPED_WIN32_BACKSLASHES = /\\(?![()[\]{}!+@])/g;
function convertPosixPathToPattern(path2) {
  return escapePosixPath(path2);
}
function convertWin32PathToPattern(path2) {
  return escapeWin32Path(path2).replace(ESCAPED_WIN32_BACKSLASHES, "/");
}
var convertPathToPattern = process.platform === "win32" ? convertWin32PathToPattern : convertPosixPathToPattern;
var POSIX_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/g;
var WIN32_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}]|^!|[!+@](?=\())/g;
var escapePosixPath = (path2) => path2.replace(POSIX_UNESCAPED_GLOB_SYMBOLS, "\\$&");
var escapeWin32Path = (path2) => path2.replace(WIN32_UNESCAPED_GLOB_SYMBOLS, "\\$&");
var escapePath = process.platform === "win32" ? escapeWin32Path : escapePosixPath;
function isDynamicPattern(pattern, options) {
  if ((options == null ? void 0 : options.caseSensitiveMatch) === false) {
    return true;
  }
  const scan = import_picomatch.default.scan(pattern);
  return scan.isGlob || scan.negated;
}

// src/index.ts
function normalizePattern(pattern, expandDirectories, cwd, properties, isIgnore) {
  var _a;
  let result = pattern;
  if (pattern.endsWith("/")) {
    result = pattern.slice(0, -1);
  }
  if (!result.endsWith("*") && expandDirectories) {
    result += "/**";
  }
  if (import_node_path.default.isAbsolute(result.replace(/\\(?=[()[\]{}!*+?@|])/g, ""))) {
    result = import_node_path.posix.relative(cwd, result);
  } else {
    result = import_node_path.posix.normalize(result);
  }
  const parentDirectoryMatch = /^(\/?\.\.)+/.exec(result);
  if (parentDirectoryMatch == null ? void 0 : parentDirectoryMatch[0]) {
    const potentialRoot = import_node_path.posix.join(cwd, parentDirectoryMatch[0]);
    if (properties.root.length > potentialRoot.length) {
      properties.root = potentialRoot;
      properties.depthOffset = -(parentDirectoryMatch[0].length + 1) / 3;
    }
  } else if (!isIgnore && properties.depthOffset >= 0) {
    const current = result.split("/");
    (_a = properties.commonPath) != null ? _a : properties.commonPath = current;
    const newCommonPath = [];
    for (let i = 0; i < Math.min(properties.commonPath.length, current.length); i++) {
      const part = current[i];
      if (part === "**" && !current[i + 1]) {
        newCommonPath.pop();
        break;
      }
      if (part !== properties.commonPath[i] || isDynamicPattern(part) || i === current.length - 1) {
        break;
      }
      newCommonPath.push(part);
    }
    properties.depthOffset = newCommonPath.length;
    properties.commonPath = newCommonPath;
    properties.root = newCommonPath.length > 0 ? `${cwd}/${newCommonPath.join("/")}` : cwd;
  }
  return result;
}
function processPatterns({ patterns, ignore = [], expandDirectories = true }, cwd, properties) {
  if (typeof patterns === "string") {
    patterns = [patterns];
  } else if (!patterns) {
    patterns = ["**/*"];
  }
  if (typeof ignore === "string") {
    ignore = [ignore];
  }
  const matchPatterns = [];
  const ignorePatterns = [];
  for (const pattern of ignore) {
    if (!pattern.startsWith("!") || pattern[1] === "(") {
      const newPattern = normalizePattern(pattern, expandDirectories, cwd, properties, true);
      ignorePatterns.push(newPattern);
    }
  }
  for (const pattern of patterns) {
    if (!pattern.startsWith("!") || pattern[1] === "(") {
      const newPattern = normalizePattern(pattern, expandDirectories, cwd, properties, false);
      matchPatterns.push(newPattern);
    } else if (pattern[1] !== "!" || pattern[2] === "(") {
      const newPattern = normalizePattern(pattern.slice(1), expandDirectories, cwd, properties, true);
      ignorePatterns.push(newPattern);
    }
  }
  return { match: matchPatterns, ignore: ignorePatterns };
}
function getRelativePath(path2, cwd, root) {
  return import_node_path.posix.relative(cwd, `${root}/${path2}`);
}
function processPath(path2, cwd, root, isDirectory, absolute) {
  const relativePath = absolute ? path2.slice(root.length + 1) || "." : path2;
  if (root === cwd) {
    return isDirectory && relativePath !== "." ? relativePath.slice(0, -1) : relativePath;
  }
  return getRelativePath(relativePath, cwd, root);
}
function crawl(options, cwd, sync) {
  const properties = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };
  const processed = processPatterns(options, cwd, properties);
  const matcher = (0, import_picomatch2.default)(processed.match, {
    dot: options.dot,
    nocase: options.caseSensitiveMatch === false,
    ignore: processed.ignore
  });
  const exclude = (0, import_picomatch2.default)(processed.ignore, {
    dot: options.dot,
    nocase: options.caseSensitiveMatch === false
  });
  const fdirOptions = {
    // use relative paths in the matcher
    filters: [(p, isDirectory) => matcher(processPath(p, cwd, properties.root, isDirectory, options.absolute))],
    exclude: (_, p) => exclude(processPath(p, cwd, properties.root, true, true)),
    pathSeparator: "/",
    relativePaths: true,
    resolveSymlinks: true
  };
  if (options.deep) {
    fdirOptions.maxDepth = Math.round(options.deep - properties.depthOffset);
  }
  if (options.absolute) {
    fdirOptions.relativePaths = false;
    fdirOptions.resolvePaths = true;
    fdirOptions.includeBasePath = true;
  }
  if (options.followSymbolicLinks === false) {
    fdirOptions.resolveSymlinks = false;
    fdirOptions.excludeSymlinks = true;
  }
  if (options.onlyDirectories) {
    fdirOptions.excludeFiles = true;
    fdirOptions.includeDirs = true;
  } else if (options.onlyFiles === false) {
    fdirOptions.includeDirs = true;
  }
  properties.root = properties.root.replace(/\\/g, "");
  const api = new import_fdir.fdir(fdirOptions).crawl(properties.root);
  if (cwd === properties.root || options.absolute) {
    return sync ? api.sync() : api.withPromise();
  }
  return sync ? api.sync().map((p) => getRelativePath(p, cwd, properties.root) + (!p || p.endsWith("/") ? "/" : "")) : api.withPromise().then((paths) => paths.map((p) => getRelativePath(p, cwd, properties.root) + (!p || p.endsWith("/") ? "/" : "")));
}
async function glob(patternsOrOptions, options) {
  if (patternsOrOptions && (options == null ? void 0 : options.patterns)) {
    throw new Error("Cannot pass patterns as both an argument and an option");
  }
  const opts = Array.isArray(patternsOrOptions) || typeof patternsOrOptions === "string" ? { ...options, patterns: patternsOrOptions } : patternsOrOptions;
  const cwd = opts.cwd ? import_node_path.default.resolve(opts.cwd).replace(/\\/g, "/") : process.cwd().replace(/\\/g, "/");
  return crawl(opts, cwd, false);
}
function globSync(patternsOrOptions, options) {
  if (patternsOrOptions && (options == null ? void 0 : options.patterns)) {
    throw new Error("Cannot pass patterns as both an argument and an option");
  }
  const opts = Array.isArray(patternsOrOptions) || typeof patternsOrOptions === "string" ? { ...options, patterns: patternsOrOptions } : patternsOrOptions;
  const cwd = opts.cwd ? import_node_path.default.resolve(opts.cwd).replace(/\\/g, "/") : process.cwd().replace(/\\/g, "/");
  return crawl(opts, cwd, true);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  convertPathToPattern,
  escapePath,
  glob,
  globSync,
  isDynamicPattern
});
