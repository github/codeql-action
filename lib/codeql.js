"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtraOptions = exports.getCachedCodeQL = exports.setCodeQL = exports.getCodeQL = exports.convertToSemVer = exports.getCodeQLURLVersion = exports.setupCodeQL = exports.getCodeQLActionRepository = exports.CODEQL_VERSION_NEW_TRACING = exports.CommandInvocationError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const query_string_1 = __importDefault(require("query-string"));
const semver = __importStar(require("semver"));
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
const defaults = __importStar(require("./defaults.json")); // Referenced from codeql-action-sync-tool!
const error_matcher_1 = require("./error-matcher");
const languages_1 = require("./languages");
const toolcache = __importStar(require("./toolcache"));
const toolrunner_error_catcher_1 = require("./toolrunner-error-catcher");
const util = __importStar(require("./util"));
class CommandInvocationError extends Error {
    constructor(cmd, args, exitCode, error) {
        super(`Failure invoking ${cmd} with arguments ${args}.\n
      Exit code ${exitCode} and error was:\n
      ${error}`);
    }
}
exports.CommandInvocationError = CommandInvocationError;
/**
 * Stores the CodeQL object, and is populated by `setupCodeQL` or `getCodeQL`.
 * Can be overridden in tests using `setCodeQL`.
 */
let cachedCodeQL = undefined;
const CODEQL_BUNDLE_VERSION = defaults.bundleVersion;
const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
/**
 * The oldest version of CodeQL that the Action will run with. This should be
 * at least three minor versions behind the current version. The version flags
 * below can be used to conditionally enable certain features on versions newer
 * than this. Please record the reason we cannot support an older version.
 *
 * Reason: Changes to how the tracing environment is set up.
 */
const CODEQL_MINIMUM_VERSION = "2.3.1";
/**
 * Versions of CodeQL that version-flag certain functionality in the Action.
 * For convenience, please keep these in descending order. Once a version
 * flag is older than the oldest supported version above, it may be removed.
 */
const CODEQL_VERSION_RAM_FINALIZE = "2.5.8";
const CODEQL_VERSION_DIAGNOSTICS = "2.5.6";
const CODEQL_VERSION_METRICS = "2.5.5";
const CODEQL_VERSION_GROUP_RULES = "2.5.5";
const CODEQL_VERSION_SARIF_GROUP = "2.5.3";
exports.CODEQL_VERSION_NEW_TRACING = "2.6.0"; // Use multi-language (>= 2.5.6) and indirect (>= 2.6.0) tracing.
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
    if (!util.isActions()) {
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
    if ((0, actions_util_1.isRunningLocalAction)()) {
        // This handles the case where the Action does not come from an Action repository,
        // e.g. our integration tests which use the Action code from the current checkout.
        logger.info("The CodeQL Action is checked out locally. Using the default CodeQL Action repository.");
        return CODEQL_DEFAULT_ACTION_REPOSITORY;
    }
    logger.info("GITHUB_ACTION_REPOSITORY environment variable was not set. Falling back to legacy method of finding the GitHub Action.");
    const relativeScriptPathParts = (0, actions_util_1.getRelativeScriptPath)().split(path.sep);
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
        return !self.slice(0, index).some((other) => (0, fast_deep_equal_1.default)(source, other));
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
async function setupCodeQL(codeqlURL, apiDetails, tempDir, toolCacheDir, variant, logger, checkVersion) {
    try {
        // We use the special value of 'latest' to prioritize the version in the
        // defaults over any pinned cached version.
        const forceLatest = codeqlURL === "latest";
        if (forceLatest) {
            codeqlURL = undefined;
        }
        let codeqlFolder;
        let codeqlURLVersion;
        if (codeqlURL && !codeqlURL.startsWith("http")) {
            codeqlFolder = await toolcache.extractTar(codeqlURL, tempDir, logger);
            codeqlURLVersion = "local";
        }
        else {
            codeqlURLVersion = getCodeQLURLVersion(codeqlURL || `/${CODEQL_BUNDLE_VERSION}/`);
            const codeqlURLSemVer = convertToSemVer(codeqlURLVersion, logger);
            // If we find the specified version, we always use that.
            codeqlFolder = toolcache.find("CodeQL", codeqlURLSemVer, toolCacheDir, logger);
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
                const codeqlPath = await toolcache.downloadTool(codeqlURL, tempDir, headers);
                logger.debug(`CodeQL bundle download to ${codeqlPath} complete.`);
                const codeqlExtracted = await toolcache.extractTar(codeqlPath, tempDir, logger);
                codeqlFolder = await toolcache.cacheDir(codeqlExtracted, "CodeQL", codeqlURLSemVer, toolCacheDir, logger);
            }
        }
        let codeqlCmd = path.join(codeqlFolder, "codeql", "codeql");
        if (process.platform === "win32") {
            codeqlCmd += ".exe";
        }
        else if (process.platform !== "linux" && process.platform !== "darwin") {
            throw new Error(`Unsupported platform: ${process.platform}`);
        }
        cachedCodeQL = await getCodeQLForCmd(codeqlCmd, checkVersion);
        return { codeql: cachedCodeQL, toolsVersion: codeqlURLVersion };
    }
    catch (e) {
        logger.error(e instanceof Error ? e : new Error(String(e)));
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
async function getCodeQL(cmd) {
    if (cachedCodeQL === undefined) {
        cachedCodeQL = await getCodeQLForCmd(cmd, true);
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
        getVersion: resolveFunction(partialCodeql, "getVersion", () => new Promise((resolve) => resolve("1.0.0"))),
        printVersion: resolveFunction(partialCodeql, "printVersion"),
        getTracerEnv: resolveFunction(partialCodeql, "getTracerEnv"),
        databaseInit: resolveFunction(partialCodeql, "databaseInit"),
        databaseInitCluster: resolveFunction(partialCodeql, "databaseInitCluster"),
        runAutobuild: resolveFunction(partialCodeql, "runAutobuild"),
        extractScannedLanguage: resolveFunction(partialCodeql, "extractScannedLanguage"),
        finalizeDatabase: resolveFunction(partialCodeql, "finalizeDatabase"),
        resolveLanguages: resolveFunction(partialCodeql, "resolveLanguages"),
        resolveQueries: resolveFunction(partialCodeql, "resolveQueries"),
        packDownload: resolveFunction(partialCodeql, "packDownload"),
        databaseCleanup: resolveFunction(partialCodeql, "databaseCleanup"),
        databaseBundle: resolveFunction(partialCodeql, "databaseBundle"),
        databaseRunQueries: resolveFunction(partialCodeql, "databaseRunQueries"),
        databaseInterpretResults: resolveFunction(partialCodeql, "databaseInterpretResults"),
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
async function getCodeQLForCmd(cmd, checkVersion) {
    let cachedVersion = undefined;
    const codeql = {
        getPath() {
            return cmd;
        },
        async getVersion() {
            if (cachedVersion === undefined)
                cachedVersion = runTool(cmd, ["version", "--format=terse"]);
            return await cachedVersion;
        },
        async printVersion() {
            await runTool(cmd, ["version", "--format=json"]);
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
            await runTool(cmd, [
                "database",
                "trace-command",
                databasePath,
                ...getExtraOptionsFromEnv(["database", "trace-command"]),
                process.execPath,
                tracerEnvJs,
                envFile,
            ]);
            return JSON.parse(fs.readFileSync(envFile, "utf-8"));
        },
        async databaseInit(databasePath, language, sourceRoot) {
            await runTool(cmd, [
                "database",
                "init",
                databasePath,
                `--language=${language}`,
                `--source-root=${sourceRoot}`,
                ...getExtraOptionsFromEnv(["database", "init"]),
            ]);
        },
        async databaseInitCluster(databasePath, languages, sourceRoot, processName, processLevel) {
            const extraArgs = languages.map((language) => `--language=${language}`);
            if (languages.filter(languages_1.isTracedLanguage).length > 0) {
                extraArgs.push("--begin-tracing");
                if (processName !== undefined) {
                    extraArgs.push(`--trace-process-name=${processName}`);
                }
                else {
                    extraArgs.push(`--trace-process-level=${processLevel || 3}`);
                }
            }
            await runTool(cmd, [
                "database",
                "init",
                "--db-cluster",
                databasePath,
                `--source-root=${sourceRoot}`,
                ...extraArgs,
                ...getExtraOptionsFromEnv(["database", "init"]),
            ]);
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
            await runTool(autobuildCmd);
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
            await (0, toolrunner_error_catcher_1.toolrunnerErrorCatcher)(cmd, [
                "database",
                "trace-command",
                ...getExtraOptionsFromEnv(["database", "trace-command"]),
                databasePath,
                "--",
                traceCommand,
            ], error_matcher_1.errorMatchers);
        },
        async finalizeDatabase(databasePath, threadsFlag, memoryFlag) {
            const args = [
                "database",
                "finalize",
                "--finalize-dataset",
                threadsFlag,
                ...getExtraOptionsFromEnv(["database", "finalize"]),
                databasePath,
            ];
            if (await util.codeQlVersionAbove(this, CODEQL_VERSION_RAM_FINALIZE))
                args.push(memoryFlag);
            await (0, toolrunner_error_catcher_1.toolrunnerErrorCatcher)(cmd, args, error_matcher_1.errorMatchers);
        },
        async resolveLanguages() {
            const codeqlArgs = ["resolve", "languages", "--format=json"];
            const output = await runTool(cmd, codeqlArgs);
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
            const output = await runTool(cmd, codeqlArgs);
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve queries: ${e}`);
            }
        },
        async databaseRunQueries(databasePath, extraSearchPath, querySuitePath, memoryFlag, threadsFlag) {
            const codeqlArgs = [
                "database",
                "run-queries",
                memoryFlag,
                threadsFlag,
                databasePath,
                "--min-disk-free=1024",
                "-v",
                ...getExtraOptionsFromEnv(["database", "run-queries"]),
            ];
            if (extraSearchPath !== undefined) {
                codeqlArgs.push("--additional-packs", extraSearchPath);
            }
            codeqlArgs.push(querySuitePath);
            await runTool(cmd, codeqlArgs);
        },
        async databaseInterpretResults(databasePath, querySuitePaths, sarifFile, addSnippetsFlag, threadsFlag, automationDetailsId) {
            const codeqlArgs = [
                "database",
                "interpret-results",
                threadsFlag,
                "--format=sarif-latest",
                "-v",
                `--output=${sarifFile}`,
                addSnippetsFlag,
                ...getExtraOptionsFromEnv(["database", "interpret-results"]),
            ];
            if (await util.codeQlVersionAbove(this, CODEQL_VERSION_DIAGNOSTICS))
                codeqlArgs.push("--print-diagnostics-summary");
            if (await util.codeQlVersionAbove(this, CODEQL_VERSION_METRICS))
                codeqlArgs.push("--print-metrics-summary");
            if (await util.codeQlVersionAbove(this, CODEQL_VERSION_GROUP_RULES))
                codeqlArgs.push("--sarif-group-rules-by-pack");
            if (automationDetailsId !== undefined &&
                (await util.codeQlVersionAbove(this, CODEQL_VERSION_SARIF_GROUP))) {
                codeqlArgs.push("--sarif-category", automationDetailsId);
            }
            codeqlArgs.push(databasePath, ...querySuitePaths);
            // capture stdout, which contains analysis summaries
            return await runTool(cmd, codeqlArgs);
        },
        /**
         * Download specified packs into the package cache. If the specified
         * package and version already exists (e.g., from a previous analysis run),
         * then it is not downloaded again (unless the extra option `--force` is
         * specified).
         *
         * If no version is specified, then the latest version is
         * downloaded. The check to determine what the latest version is is done
         * each time this package is requested.
         */
        async packDownload(packs) {
            const codeqlArgs = [
                "pack",
                "download",
                "--format=json",
                ...getExtraOptionsFromEnv(["pack", "download"]),
                ...packs.map(packWithVersionToString),
            ];
            const output = await runTool(cmd, codeqlArgs);
            try {
                const parsedOutput = JSON.parse(output);
                if (Array.isArray(parsedOutput.packs) &&
                    // TODO PackDownloadOutput will not include the version if it is not specified
                    // in the input. The version is always the latest version available.
                    // It should be added to the output, but this requires a CLI change
                    parsedOutput.packs.every((p) => p.name /* && p.version */)) {
                    return parsedOutput;
                }
                else {
                    throw new Error("Unexpected output from pack download");
                }
            }
            catch (e) {
                throw new Error(`Attempted to download specified packs but got an error:\n${output}\n${e}`);
            }
        },
        async databaseCleanup(databasePath, cleanupLevel) {
            const codeqlArgs = [
                "database",
                "cleanup",
                databasePath,
                `--mode=${cleanupLevel}`,
            ];
            await runTool(cmd, codeqlArgs);
        },
        async databaseBundle(databasePath, outputFilePath) {
            const args = [
                "database",
                "bundle",
                databasePath,
                `--output=${outputFilePath}`,
            ];
            await new toolrunner.ToolRunner(cmd, args).exec();
        },
    };
    if (checkVersion &&
        !(await util.codeQlVersionAbove(codeql, CODEQL_MINIMUM_VERSION))) {
        throw new Error(`Expected a CodeQL CLI with version at least ${CODEQL_MINIMUM_VERSION} but got version ${await codeql.getVersion()}`);
    }
    return codeql;
}
function packWithVersionToString(pack) {
    return pack.version ? `${pack.packName}@${pack.version}` : pack.packName;
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
    const all = asExtraOptions(options === null || options === void 0 ? void 0 : options["*"], pathInfo.concat("*"));
    const specific = paths.length === 0
        ? asExtraOptions(options, pathInfo)
        : getExtraOptions(options === null || options === void 0 ? void 0 : options[paths[0]], paths === null || paths === void 0 ? void 0 : paths.slice(1), pathInfo.concat(paths[0]));
    return all.concat(specific);
}
exports.getExtraOptions = getExtraOptions;
/*
 * A constant defining the maximum number of characters we will keep from
 * the programs stderr for logging. This serves two purposes:
 * (1) It avoids an OOM if a program fails in a way that results it
 *     printing many log lines.
 * (2) It avoids us hitting the limit of how much data we can send in our
 *     status reports on GitHub.com.
 */
const maxErrorSize = 20000;
async function runTool(cmd, args = []) {
    let output = "";
    let error = "";
    const exitCode = await new toolrunner.ToolRunner(cmd, args, {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            },
            stderr: (data) => {
                const toRead = Math.min(maxErrorSize - error.length, data.length);
                error += data.toString("utf8", 0, toRead);
            },
        },
        ignoreReturnCode: true,
    }).exec();
    if (exitCode !== 0)
        throw new CommandInvocationError(cmd, args, exitCode, error);
    return output;
}
//# sourceMappingURL=codeql.js.map