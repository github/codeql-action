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
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDatabases = void 0;
const fs = __importStar(require("fs"));
const actionsUtil = __importStar(require("./actions-util"));
const api_client_1 = require("./api-client");
const codeql_1 = require("./codeql");
const util = __importStar(require("./util"));
async function uploadDatabases(repositoryNwo, config, apiDetails, logger) {
    if (actionsUtil.getRequiredInput("upload-database") !== "true") {
        logger.debug("Database upload disabled in workflow. Skipping upload.");
        return;
    }
    // Do nothing when not running against github.com
    if (config.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
        logger.debug("Not running against github.com. Skipping upload.");
        return;
    }
    if (!(await actionsUtil.isAnalyzingDefaultBranch())) {
        // We only want to upload a database if we are analyzing the default branch.
        logger.debug("Not analyzing default branch. Skipping upload.");
        return;
    }
    const client = api_client_1.getApiClient(apiDetails);
    try {
        await client.request("GET /repos/:owner/:repo/code-scanning/codeql/databases", {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
        });
    }
    catch (e) {
        if (util.isHTTPError(e) && e.status === 404) {
            logger.debug("Repository is not opted in to database uploads. Skipping upload.");
        }
        else {
            console.log(e);
            logger.info(`Skipping database upload due to unknown error: ${e}`);
        }
        return;
    }
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        // Bundle the database up into a single zip file
        const databasePath = util.getCodeQLDatabasePath(config, language);
        const databaseBundlePath = `${databasePath}.zip`;
        await codeql.databaseBundle(databasePath, databaseBundlePath);
        // Upload the database bundle
        const payload = fs.readFileSync(databaseBundlePath);
        try {
            await client.request(`PUT /repos/:owner/:repo/code-scanning/codeql/databases/:language`, {
                owner: repositoryNwo.owner,
                repo: repositoryNwo.repo,
                language,
                data: payload,
            });
            logger.debug(`Successfully uploaded database for ${language}`);
        }
        catch (e) {
            console.log(e);
            // Log a warning but don't fail the workflow
            logger.warning(`Failed to upload database for ${language}: ${e}`);
        }
    }
}
exports.uploadDatabases = uploadDatabases;
//# sourceMappingURL=database-upload.js.map