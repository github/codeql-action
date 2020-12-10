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
const analyze_1 = require("./analyze");
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
        await analyze_1.finalizeDatabaseCreation(config, util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger), logger);
    }
    catch (error) {
        core.setFailed(`We were unable to create the database.  ${error.message}`);
        console.log(error);
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`create-database action failed. ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=create-database-action.js.map