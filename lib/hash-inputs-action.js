"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const actionsUtil = __importStar(require("./actions-util"));
const config_utils = __importStar(require("./config-utils"));
const logging_1 = require("./logging");
const util = __importStar(require("./util"));
const languages_1 = require("./languages");
async function getCodeQLHash(_config) {
    return "DUMMY_CODEQL_HASH";
}
async function getQueriesHash(_language, config, logger) {
    // Compute hash
    const globHash = require("glob-hash");
    const finalHash = await globHash({
        include: [
            // @esbena: isn't this a bit too aggressive? Could we select qlpack directories instead?
            `${config.tempDir}/**/.cache/data/**`,
            `${config.toolCacheDir}/**/.cache/data/**`,
        ],
        files: false,
    });
    logger.info(`queries-hash: ${finalHash}`);
    return finalHash;
}
async function getDatabaseHash(language, config, logger) {
    const dbPath = util.getCodeQLDatabasePath(config.tempDir, language);
    let relDir = path.join(dbPath, `db-${language}`, "default");
    let combined_all = crypto.createHash("sha256");
    let combined_noExtractionTime = crypto.createHash("sha256");
    let files = {};
    let relFiles = fs
        .readdirSync(relDir)
        .filter((n) => n.endsWith(".rel"))
        .map((n) => path.join(relDir, n));
    if (relFiles.length === 0) {
        throw new Error(`No '.rel' files found in ${relDir}. Has the 'create-database' action been called?`);
    }
    for (const relFile of relFiles) {
        let content = fs.readFileSync(relFile); // XXX this ought to be chunked for large tables!
        let solo = crypto.createHash("sha256");
        solo.update(content);
        files[path.relative(dbPath, relFile)] = solo.digest("hex");
        if (language === languages_1.Language.javascript &&
            path.basename(relFile) !== "extraction_time.rel") {
            combined_noExtractionTime.update(content);
        }
        combined_all.update(content);
    }
    let stableHash = combined_noExtractionTime.digest("hex");
    logger.info("database-hash:");
    logger.info(JSON.stringify({
        language,
        combined: {
            all: combined_all.digest("hex"),
            noExtractionTime: stableHash,
            files,
        },
    }, null, 2));
    return stableHash;
}
async function run() {
    const logger = logging_1.getActionsLogger();
    try {
        actionsUtil.prepareLocalRunEnvironment();
        const config = await config_utils.getConfig(actionsUtil.getRequiredEnvParam("RUNNER_TEMP"), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        let hashesByLanguage = {};
        for (const language of config.languages) {
            hashesByLanguage /* XXX circumvent aggressive typescript */[language] = {
                queries: await getQueriesHash(language, config, logger),
                database: await getDatabaseHash(language, config, logger),
                codeql: getCodeQLHash(config),
            };
        }
        logger.info("hashes:");
        logger.info(JSON.stringify(hashesByLanguage, null, 2));
        core.setOutput("hashes", JSON.stringify(hashesByLanguage));
    }
    catch (error) {
        core.setFailed(`We were unable to hash the inputs.  ${error.message}`);
        console.log(error);
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`hash-inputs action failed. ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=hash-inputs-action.js.map