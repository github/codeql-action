"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDatabases = uploadDatabases;
const fs = __importStar(require("fs"));
const actionsUtil = __importStar(require("./actions-util"));
const api_client_1 = require("./api-client");
const codeql_1 = require("./codeql");
const gitUtils = __importStar(require("./git-utils"));
const util = __importStar(require("./util"));
const util_1 = require("./util");
async function uploadDatabases(repositoryNwo, config, apiDetails, logger) {
    if (actionsUtil.getRequiredInput("upload-database") !== "true") {
        logger.debug("Database upload disabled in workflow. Skipping upload.");
        return;
    }
    if (util.isInTestMode()) {
        logger.debug("In test mode. Skipping database upload.");
        return;
    }
    // Do nothing when not running against github.com
    if (config.gitHubVersion.type !== util.GitHubVariant.DOTCOM &&
        config.gitHubVersion.type !== util.GitHubVariant.GHE_DOTCOM) {
        logger.debug("Not running against github.com or GHEC-DR. Skipping upload.");
        return;
    }
    if (!(await gitUtils.isAnalyzingDefaultBranch())) {
        // We only want to upload a database if we are analyzing the default branch.
        logger.debug("Not analyzing default branch. Skipping upload.");
        return;
    }
    const client = (0, api_client_1.getApiClient)();
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    const uploadsUrl = new URL((0, util_1.parseGitHubUrl)(apiDetails.url));
    uploadsUrl.hostname = `uploads.${uploadsUrl.hostname}`;
    // Octokit expects the baseUrl to not have a trailing slash,
    // but it is included by default in a URL.
    let uploadsBaseUrl = uploadsUrl.toString();
    if (uploadsBaseUrl.endsWith("/")) {
        uploadsBaseUrl = uploadsBaseUrl.slice(0, -1);
    }
    for (const language of config.languages) {
        try {
            // Upload the database bundle.
            // Although we are uploading arbitrary file contents to the API, it's worth
            // noting that it's the API's job to validate that the contents is acceptable.
            // This API method is available to anyone with write access to the repo.
            const bundledDb = await (0, util_1.bundleDb)(config, language, codeql, language);
            const bundledDbSize = fs.statSync(bundledDb).size;
            const bundledDbReadStream = fs.createReadStream(bundledDb);
            const commitOid = await gitUtils.getCommitOid(actionsUtil.getRequiredInput("checkout_path"));
            try {
                await client.request(`POST /repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name&commit_oid=:commit_oid`, {
                    baseUrl: uploadsBaseUrl,
                    owner: repositoryNwo.owner,
                    repo: repositoryNwo.repo,
                    language,
                    name: `${language}-database`,
                    commit_oid: commitOid,
                    data: bundledDbReadStream,
                    headers: {
                        authorization: `token ${apiDetails.auth}`,
                        "Content-Type": "application/zip",
                        "Content-Length": bundledDbSize,
                    },
                });
                logger.debug(`Successfully uploaded database for ${language}`);
            }
            finally {
                bundledDbReadStream.close();
            }
        }
        catch (e) {
            // Log a warning but don't fail the workflow
            logger.warning(`Failed to upload database for ${language}: ${e}`);
        }
    }
}
//# sourceMappingURL=database-upload.js.map