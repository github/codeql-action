import pkg from "./package.json" with { type: "json" };

globalThis.__CODEQL_ACTION_VERSION__ = pkg.version;
