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
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const config_utils = __importStar(require("./config-utils"));
const logging_1 = require("./logging");
const util = __importStar(require("./util"));
const hash_inputs_1 = require("./hash-inputs");
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
    return hash_inputs_1.DatabaseHash(language, dbPath, logger);
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