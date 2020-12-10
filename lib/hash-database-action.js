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
async function run() {
    const logger = logging_1.getActionsLogger();
    try {
        actionsUtil.prepareLocalRunEnvironment();
        const config = await config_utils.getConfig(actionsUtil.getRequiredEnvParam("RUNNER_TEMP"), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        for (const language of config.languages) {
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
                if (language === "javascript" &&
                    path.basename(relFile) !== "extraction_time.rel") {
                    combined_noExtractionTime.update(content);
                }
                combined_all.update(content);
            }
            let stableHash = combined_noExtractionTime.digest("hex");
            logger.info(JSON.stringify({
                language,
                combined: {
                    all: combined_all.digest("hex"),
                    noExtractionTime: stableHash,
                    files,
                },
            }, null, 2));
            core.setOutput("hash", stableHash);
        }
    }
    catch (error) {
        core.setFailed(`We were unable to hash the database.  ${error.message}`);
        console.log(error);
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`hash-database action failed. ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=hash-database-action.js.map