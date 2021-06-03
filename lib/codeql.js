"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stream = __importStar(require("stream"));
const globalutil = __importStar(require("util"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const http = __importStar(require("@actions/http-client"));
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const query_string_1 = __importDefault(require("query-string"));
const semver = __importStar(require("semver"));
const uuid_1 = require("uuid");
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
const defaults = __importStar(require("./defaults.json")); // Referenced from codeql-action-sync-tool!
const error_matcher_1 = require("./error-matcher");
const toolcache = __importStar(require("./toolcache"));
const toolrunner_error_catcher_1 = require("./toolrunner-error-catcher");
const util = __importStar(require("./util"));
/**
 * Stores the CodeQL object, and is populated by `setupCodeQL` or `getCodeQL`.
 * Can be overridden in tests using `setCodeQL`.
 */
let cachedCodeQL = undefined;
const CODEQL_BUNDLE_VERSION = defaults.bundleVersion;
const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
function getCodeQLBundleName() {
    let platform;
    if (process.platform === "win32") {
        platform = "win64";
    }
    else if (process.platform === "linux") {
        platform = "linux64";
    }
    else if (process.platform === "darwin") {
        platform = "osx64";
    }
    else {
        return "codeql-bundle.tar.gz";
    }
    return `codeql-bundle-${platform}.tar.gz`;
}
function getCodeQLActionRepository(logger) {
    if (util.isActions()) {
        return CODEQL_DEFAULT_ACTION_REPOSITORY;
    }
    else {
        return getActionsCodeQLActionRepository(logger);
    }
}
exports.getCodeQLActionRepository = getCodeQLActionRepository;
function getActionsCodeQLActionRepository(logger) {
    if (process.env["GITHUB_ACTION_REPOSITORY"] !== undefined) {
        return process.env["GITHUB_ACTION_REPOSITORY"];
    }
    // The Actions Runner used with GitHub Enterprise Server 2.22 did not set the GITHUB_ACTION_REPOSITORY variable.
    // This fallback logic can be removed after the end-of-support for 2.22 on 2021-09-23.
    if (actions_util_1.isRunningLocalAction()) {
        // This handles the case where the Action does not come from an Action repository,
        // e.g. our integration tests which use the Action code from the current checkout.
        logger.info("The CodeQL Action is checked out locally. Using the default CodeQL Action repository.");
        return CODEQL_DEFAULT_ACTION_REPOSITORY;
    }
    logger.info("GITHUB_ACTION_REPOSITORY environment variable was not set. Falling back to legacy method of finding the GitHub Action.");
    const relativeScriptPathParts = actions_util_1.getRelativeScriptPath().split(path.sep);
    return `${relativeScriptPathParts[0]}/${relativeScriptPathParts[1]}`;
}
async function getCodeQLBundleDownloadURL(apiDetails, variant, logger) {
    const codeQLActionRepository = getCodeQLActionRepository(logger);
    const potentialDownloadSources = [
        // This GitHub instance, and this Action.
        [apiDetails.url, codeQLActionRepository],
        // This GitHub instance, and the canonical Action.
        [apiDetails.url, CODEQL_DEFAULT_ACTION_REPOSITORY],
        // GitHub.com, and the canonical Action.
        [util.GITHUB_DOTCOM_URL, CODEQL_DEFAULT_ACTION_REPOSITORY],
    ];
    // We now filter out any duplicates.
    // Duplicates will happen either because the GitHub instance is GitHub.com, or because the Action is not a fork.
    const uniqueDownloadSources = potentialDownloadSources.filter((source, index, self) => {
        return !self.slice(0, index).some((other) => fast_deep_equal_1.default(source, other));
    });
    const codeQLBundleName = getCodeQLBundleName();
    if (variant === util.GitHubVariant.GHAE) {
        try {
            const release = await api
                .getApiClient(apiDetails)
                .request("GET /enterprise/code-scanning/codeql-bundle/find/{tag}", {
                tag: CODEQL_BUNDLE_VERSION,
            });
            const assetID = release.data.assets[codeQLBundleName];
            if (assetID !== undefined) {
                const download = await api
                    .getApiClient(apiDetails)
                    .request("GET /enterprise/code-scanning/codeql-bundle/download/{asset_id}", { asset_id: assetID });
                const downloadURL = download.data.url;
                logger.info(`Found CodeQL bundle at GitHub AE endpoint with URL ${downloadURL}.`);
                return downloadURL;
            }
            else {
                logger.info(`Attempted to fetch bundle from GitHub AE endpoint but the bundle ${codeQLBundleName} was not found in the assets ${JSON.stringify(release.data.assets)}.`);
            }
        }
        catch (e) {
            logger.info(`Attempted to fetch bundle from GitHub AE endpoint but got error ${e}.`);
        }
    }
    for (const downloadSource of uniqueDownloadSources) {
        const [apiURL, repository] = downloadSource;
        // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
        if (apiURL === util.GITHUB_DOTCOM_URL &&
            repository === CODEQL_DEFAULT_ACTION_REPOSITORY) {
            break;
        }
        const [repositoryOwner, repositoryName] = repository.split("/");
        try {
            const release = await api.getApiClient(apiDetails).repos.getReleaseByTag({
                owner: repositoryOwner,
                repo: repositoryName,
                tag: CODEQL_BUNDLE_VERSION,
            });
            for (const asset of release.data.assets) {
                if (asset.name === codeQLBundleName) {
                    logger.info(`Found CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} with URL ${asset.url}.`);
                    return asset.url;
                }
            }
        }
        catch (e) {
            logger.info(`Looked for CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} but got error ${e}.`);
        }
    }
    return `https://github.com/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${CODEQL_BUNDLE_VERSION}/${codeQLBundleName}`;
}
// We have to download CodeQL manually because the toolcache doesn't support Accept headers.
// This can be removed once https://github.com/actions/toolkit/pull/530 is merged and released.
async function toolcacheDownloadTool(url, headers, tempDir, logger) {
    const client = new http.HttpClient("CodeQL Action");
    const dest = path.join(tempDir, uuid_1.v4());
    const response = await client.get(url, headers);
    if (response.message.statusCode !== 200) {
        logger.info(`Failed to download from "${url}". Code(${response.message.statusCode}) Message(${response.message.statusMessage})`);
        throw new Error(`Unexpected HTTP response: ${response.message.statusCode}`);
    }
    const pipeline = globalutil.promisify(stream.pipeline);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await pipeline(response.message, fs.createWriteStream(dest));
    return dest;
}
async function setupCodeQL(codeqlURL, apiDetails, tempDir, toolCacheDir, variant, logger) {
    try {
        // We use the special value of 'latest' to prioritize the version in the
        // defaults over any pinned cached version.
        const forceLatest = codeqlURL === "latest";
        if (forceLatest) {
            codeqlURL = undefined;
        }
        const codeqlURLVersion = getCodeQLURLVersion(codeqlURL || `/${CODEQL_BUNDLE_VERSION}/`);
        const codeqlURLSemVer = convertToSemVer(codeqlURLVersion, logger);
        // If we find the specified version, we always use that.
        let codeqlFolder = toolcache.find("CodeQL", codeqlURLSemVer, toolCacheDir, logger);
        // If we don't find the requested version, in some cases we may allow a
        // different version to save download time if the version hasn't been
        // specified explicitly (in which case we always honor it).
        if (!codeqlFolder && !codeqlURL && !forceLatest) {
            const codeqlVersions = toolcache.findAllVersions("CodeQL", toolCacheDir, logger);
            if (codeqlVersions.length === 1) {
                const tmpCodeqlFolder = toolcache.find("CodeQL", codeqlVersions[0], toolCacheDir, logger);
                if (fs.existsSync(path.join(tmpCodeqlFolder, "pinned-version"))) {
                    logger.debug(`CodeQL in cache overriding the default ${CODEQL_BUNDLE_VERSION}`);
                    codeqlFolder = tmpCodeqlFolder;
                }
            }
        }
        if (codeqlFolder) {
            logger.debug(`CodeQL found in cache ${codeqlFolder}`);
        }
        else {
            if (!codeqlURL) {
                codeqlURL = await getCodeQLBundleDownloadURL(apiDetails, variant, logger);
            }
            const parsedCodeQLURL = new URL(codeqlURL);
            const parsedQueryString = query_string_1.default.parse(parsedCodeQLURL.search);
            const headers = { accept: "application/octet-stream" };
            // We only want to provide an authorization header if we are downloading
            // from the same GitHub instance the Action is running on.
            // This avoids leaking Enterprise tokens to dotcom.
            // We also don't want to send an authorization header if there's already a token provided in the URL.
            if (codeqlURL.startsWith(`${apiDetails.url}/`) &&
                parsedQueryString["token"] === undefined) {
                logger.debug("Downloading CodeQL bundle with token.");
                headers.authorization = `token ${apiDetails.auth}`;
            }
            else {
                logger.debug("Downloading CodeQL bundle without token.");
            }
            logger.info(`Downloading CodeQL tools from ${codeqlURL}. This may take a while.`);
            const codeqlPath = await toolcacheDownloadTool(codeqlURL, headers, tempDir, logger);
            logger.debug(`CodeQL bundle download to ${codeqlPath} complete.`);
            const codeqlExtracted = await toolcache.extractTar(codeqlPath, tempDir, logger);
            codeqlFolder = await toolcache.cacheDir(codeqlExtracted, "CodeQL", codeqlURLSemVer, toolCacheDir, logger);
        }
        let codeqlCmd = path.join(codeqlFolder, "codeql", "codeql");
        if (process.platform === "win32") {
            codeqlCmd += ".exe";
        }
        else if (process.platform !== "linux" && process.platform !== "darwin") {
            throw new Error(`Unsupported platform: ${process.platform}`);
        }
        cachedCodeQL = getCodeQLForCmd(codeqlCmd);
        return { codeql: cachedCodeQL, toolsVersion: codeqlURLVersion };
    }
    catch (e) {
        logger.error(e);
        throw new Error("Unable to download and extract CodeQL CLI");
    }
}
exports.setupCodeQL = setupCodeQL;
function getCodeQLURLVersion(url) {
    const match = url.match(/\/codeql-bundle-(.*)\//);
    if (match === null || match.length < 2) {
        throw new Error(`Malformed tools url: ${url}. Version could not be inferred`);
    }
    return match[1];
}
exports.getCodeQLURLVersion = getCodeQLURLVersion;
function convertToSemVer(version, logger) {
    if (!semver.valid(version)) {
        logger.debug(`Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`);
        version = `0.0.0-${version}`;
    }
    const s = semver.clean(version);
    if (!s) {
        throw new Error(`Bundle version ${version} is not in SemVer format.`);
    }
    return s;
}
exports.convertToSemVer = convertToSemVer;
/**
 * Use the CodeQL executable located at the given path.
 */
function getCodeQL(cmd) {
    if (cachedCodeQL === undefined) {
        cachedCodeQL = getCodeQLForCmd(cmd);
    }
    return cachedCodeQL;
}
exports.getCodeQL = getCodeQL;
function resolveFunction(partialCodeql, methodName, defaultImplementation) {
    if (typeof partialCodeql[methodName] !== "function") {
        if (defaultImplementation !== undefined) {
            return defaultImplementation;
        }
        const dummyMethod = () => {
            throw new Error(`CodeQL ${methodName} method not correctly defined`);
        };
        return dummyMethod;
    }
    return partialCodeql[methodName];
}
/**
 * Set the functionality for CodeQL methods. Only for use in tests.
 *
 * Accepts a partial object and any undefined methods will be implemented
 * to immediately throw an exception indicating which method is missing.
 */
function setCodeQL(partialCodeql) {
    cachedCodeQL = {
        getPath: resolveFunction(partialCodeql, "getPath", () => "/tmp/dummy-path"),
        printVersion: resolveFunction(partialCodeql, "printVersion"),
        getTracerEnv: resolveFunction(partialCodeql, "getTracerEnv"),
        databaseInit: resolveFunction(partialCodeql, "databaseInit"),
        runAutobuild: resolveFunction(partialCodeql, "runAutobuild"),
        extractScannedLanguage: resolveFunction(partialCodeql, "extractScannedLanguage"),
        finalizeDatabase: resolveFunction(partialCodeql, "finalizeDatabase"),
        resolveLanguages: resolveFunction(partialCodeql, "resolveLanguages"),
        resolveQueries: resolveFunction(partialCodeql, "resolveQueries"),
        databaseAnalyze: resolveFunction(partialCodeql, "databaseAnalyze"),
    };
    return cachedCodeQL;
}
exports.setCodeQL = setCodeQL;
/**
 * Get the cached CodeQL object. Should only be used from tests.
 *
 * TODO: Work out a good way for tests to get this from the test context
 * instead of having to have this method.
 */
function getCachedCodeQL() {
    if (cachedCodeQL === undefined) {
        // Should never happen as setCodeQL is called by testing-utils.setupTests
        throw new Error("cachedCodeQL undefined");
    }
    return cachedCodeQL;
}
exports.getCachedCodeQL = getCachedCodeQL;
function getCodeQLForCmd(cmd) {
    return {
        getPath() {
            return cmd;
        },
        async printVersion() {
            await new toolrunner.ToolRunner(cmd, ["version", "--format=json"]).exec();
        },
        async getTracerEnv(databasePath) {
            // Write tracer-env.js to a temp location.
            // BEWARE: The name and location of this file is recognized by `codeql database
            // trace-command` in order to enable special support for concatenable tracer
            // configurations. Consequently the name must not be changed.
            // (This warning can be removed once a different way to recognize the
            // action/runner has been implemented in `codeql database trace-command`
            // _and_ is present in the latest supported CLI release.)
            const tracerEnvJs = path.resolve(databasePath, "working", "tracer-env.js");
            fs.mkdirSync(path.dirname(tracerEnvJs), { recursive: true });
            fs.writeFileSync(tracerEnvJs, `
        const fs = require('fs');
        const env = {};
        for (let entry of Object.entries(process.env)) {
          const key = entry[0];
          const value = entry[1];
          if (typeof value !== 'undefined' && key !== '_' && !key.startsWith('JAVA_MAIN_CLASS_')) {
            env[key] = value;
          }
        }
        process.stdout.write(process.argv[2]);
        fs.writeFileSync(process.argv[2], JSON.stringify(env), 'utf-8');`);
            // BEWARE: The name and location of this file is recognized by `codeql database
            // trace-command` in order to enable special support for concatenable tracer
            // configurations. Consequently the name must not be changed.
            // (This warning can be removed once a different way to recognize the
            // action/runner has been implemented in `codeql database trace-command`
            // _and_ is present in the latest supported CLI release.)
            const envFile = path.resolve(databasePath, "working", "env.tmp");
            await new toolrunner.ToolRunner(cmd, [
                "database",
                "trace-command",
                databasePath,
                ...getExtraOptionsFromEnv(["database", "trace-command"]),
                process.execPath,
                tracerEnvJs,
                envFile,
            ]).exec();
            return JSON.parse(fs.readFileSync(envFile, "utf-8"));
        },
        async databaseInit(databasePath, language, sourceRoot) {
            await new toolrunner.ToolRunner(cmd, [
                "database",
                "init",
                databasePath,
                `--language=${language}`,
                `--source-root=${sourceRoot}`,
                ...getExtraOptionsFromEnv(["database", "init"]),
            ]).exec();
        },
        async runAutobuild(language) {
            const cmdName = process.platform === "win32" ? "autobuild.cmd" : "autobuild.sh";
            const autobuildCmd = path.join(path.dirname(cmd), language, "tools", cmdName);
            // Update JAVA_TOOL_OPTIONS to contain '-Dhttp.keepAlive=false'
            // This is because of an issue with Azure pipelines timing out connections after 4 minutes
            // and Maven not properly handling closed connections
            // Otherwise long build processes will timeout when pulling down Java packages
            // https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
            const javaToolOptions = process.env["JAVA_TOOL_OPTIONS"] || "";
            process.env["JAVA_TOOL_OPTIONS"] = [
                ...javaToolOptions.split(/\s+/),
                "-Dhttp.keepAlive=false",
                "-Dmaven.wagon.http.pool=false",
            ].join(" ");
            await new toolrunner.ToolRunner(autobuildCmd).exec();
        },
        async extractScannedLanguage(databasePath, language) {
            // Get extractor location
            let extractorPath = "";
            await new toolrunner.ToolRunner(cmd, [
                "resolve",
                "extractor",
                "--format=json",
                `--language=${language}`,
                ...getExtraOptionsFromEnv(["resolve", "extractor"]),
            ], {
                silent: true,
                listeners: {
                    stdout: (data) => {
                        extractorPath += data.toString();
                    },
                    stderr: (data) => {
                        process.stderr.write(data);
                    },
                },
            }).exec();
            // Set trace command
            const ext = process.platform === "win32" ? ".cmd" : ".sh";
            const traceCommand = path.resolve(JSON.parse(extractorPath), "tools", `autobuild${ext}`);
            // Run trace command
            await toolrunner_error_catcher_1.toolrunnerErrorCatcher(cmd, [
                "database",
                "trace-command",
                ...getExtraOptionsFromEnv(["database", "trace-command"]),
                databasePath,
                "--",
                traceCommand,
            ], error_matcher_1.errorMatchers);
        },
        async finalizeDatabase(databasePath, threadsFlag) {
            await toolrunner_error_catcher_1.toolrunnerErrorCatcher(cmd, [
                "database",
                "finalize",
                threadsFlag,
                ...getExtraOptionsFromEnv(["database", "finalize"]),
                databasePath,
            ], error_matcher_1.errorMatchers);
        },
        async resolveLanguages() {
            const codeqlArgs = ["resolve", "languages", "--format=json"];
            let output = "";
            await new toolrunner.ToolRunner(cmd, codeqlArgs, {
                listeners: {
                    stdout: (data) => {
                        output += data.toString();
                    },
                },
            }).exec();
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve languages: ${e}`);
            }
        },
        async resolveQueries(queries, extraSearchPath) {
            const codeqlArgs = [
                "resolve",
                "queries",
                ...queries,
                "--format=bylanguage",
                ...getExtraOptionsFromEnv(["resolve", "queries"]),
            ];
            if (extraSearchPath !== undefined) {
                codeqlArgs.push("--additional-packs", extraSearchPath);
            }
            let output = "";
            await new toolrunner.ToolRunner(cmd, codeqlArgs, {
                listeners: {
                    stdout: (data) => {
                        output += data.toString();
                    },
                },
            }).exec();
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve queries: ${e}`);
            }
        },
        async databaseAnalyze(databasePath, sarifFile, extraSearchPath, querySuite, memoryFlag, addSnippetsFlag, threadsFlag, automationDetailsId) {
            const args = [
                "database",
                "analyze",
                memoryFlag,
                threadsFlag,
                databasePath,
                "--min-disk-free=1024",
                "--format=sarif-latest",
                "--sarif-multicause-markdown",
                `--output=${sarifFile}`,
                addSnippetsFlag,
                // Enable progress verbosity so we log each query as it's interpreted. This aids debugging
                // when interpretation takes a while for one of the queries being analyzed.
                "-v",
                ...getExtraOptionsFromEnv(["database", "analyze"]),
            ];
            if (extraSearchPath !== undefined) {
                args.push("--additional-packs", extraSearchPath);
            }
            if (automationDetailsId !== undefined) {
                args.push("--sarif-category", automationDetailsId);
            }
            args.push(querySuite);
            // capture stdout, which contains analysis summaries
            let output = "";
            await new toolrunner.ToolRunner(cmd, args, {
                listeners: {
                    stdout: (data) => {
                        output += data.toString("utf8");
                    },
                },
            }).exec();
            return output;
        },
    };
}
/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 */
function getExtraOptionsFromEnv(paths) {
    const options = util.getExtraOptionsEnvParam();
    return getExtraOptions(options, paths, []);
}
/**
 * Gets `options` as an array of extra option strings.
 *
 * - throws an exception mentioning `pathInfo` if this conversion is impossible.
 */
function asExtraOptions(options, pathInfo) {
    if (options === undefined) {
        return [];
    }
    if (!Array.isArray(options)) {
        const msg = `The extra options for '${pathInfo.join(".")}' ('${JSON.stringify(options)}') are not in an array.`;
        throw new Error(msg);
    }
    return options.map((o) => {
        const t = typeof o;
        if (t !== "string" && t !== "number" && t !== "boolean") {
            const msg = `The extra option for '${pathInfo.join(".")}' ('${JSON.stringify(o)}') is not a primitive value.`;
            throw new Error(msg);
        }
        return `${o}`;
    });
}
/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 *
 * - the special terminal step name '*' in `options` matches all path steps
 * - throws an exception if this conversion is impossible.
 *
 * Exported for testing.
 */
function getExtraOptions(options, paths, pathInfo) {
    var _a, _b, _c;
    const all = asExtraOptions((_a = options) === null || _a === void 0 ? void 0 : _a["*"], pathInfo.concat("*"));
    const specific = paths.length === 0
        ? asExtraOptions(options, pathInfo)
        : getExtraOptions((_b = options) === null || _b === void 0 ? void 0 : _b[paths[0]], (_c = paths) === null || _c === void 0 ? void 0 : _c.slice(1), pathInfo.concat(paths[0]));
    return all.concat(specific);
}
exports.getExtraOptions = getExtraOptions;
//# sourceMappingURL=codeql.js.map