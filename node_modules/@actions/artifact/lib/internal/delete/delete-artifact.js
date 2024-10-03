"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteArtifactInternal = exports.deleteArtifactPublic = void 0;
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const user_agent_1 = require("../shared/user-agent");
const retry_options_1 = require("../find/retry-options");
const utils_1 = require("@actions/github/lib/utils");
const plugin_request_log_1 = require("@octokit/plugin-request-log");
const plugin_retry_1 = require("@octokit/plugin-retry");
const artifact_twirp_client_1 = require("../shared/artifact-twirp-client");
const util_1 = require("../shared/util");
const generated_1 = require("../../generated");
const get_artifact_1 = require("../find/get-artifact");
const errors_1 = require("../shared/errors");
function deleteArtifactPublic(artifactName, workflowRunId, repositoryOwner, repositoryName, token) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const [retryOpts, requestOpts] = (0, retry_options_1.getRetryOptions)(utils_1.defaults);
        const opts = {
            log: undefined,
            userAgent: (0, user_agent_1.getUserAgentString)(),
            previews: undefined,
            retry: retryOpts,
            request: requestOpts
        };
        const github = (0, github_1.getOctokit)(token, opts, plugin_retry_1.retry, plugin_request_log_1.requestLog);
        const getArtifactResp = yield (0, get_artifact_1.getArtifactPublic)(artifactName, workflowRunId, repositoryOwner, repositoryName, token);
        const deleteArtifactResp = yield github.rest.actions.deleteArtifact({
            owner: repositoryOwner,
            repo: repositoryName,
            artifact_id: getArtifactResp.artifact.id
        });
        if (deleteArtifactResp.status !== 204) {
            throw new errors_1.InvalidResponseError(`Invalid response from GitHub API: ${deleteArtifactResp.status} (${(_a = deleteArtifactResp === null || deleteArtifactResp === void 0 ? void 0 : deleteArtifactResp.headers) === null || _a === void 0 ? void 0 : _a['x-github-request-id']})`);
        }
        return {
            id: getArtifactResp.artifact.id
        };
    });
}
exports.deleteArtifactPublic = deleteArtifactPublic;
function deleteArtifactInternal(artifactName) {
    return __awaiter(this, void 0, void 0, function* () {
        const artifactClient = (0, artifact_twirp_client_1.internalArtifactTwirpClient)();
        const { workflowRunBackendId, workflowJobRunBackendId } = (0, util_1.getBackendIdsFromToken)();
        const listReq = {
            workflowRunBackendId,
            workflowJobRunBackendId,
            nameFilter: generated_1.StringValue.create({ value: artifactName })
        };
        const listRes = yield artifactClient.ListArtifacts(listReq);
        if (listRes.artifacts.length === 0) {
            throw new errors_1.ArtifactNotFoundError(`Artifact not found for name: ${artifactName}`);
        }
        let artifact = listRes.artifacts[0];
        if (listRes.artifacts.length > 1) {
            artifact = listRes.artifacts.sort((a, b) => Number(b.databaseId) - Number(a.databaseId))[0];
            (0, core_1.debug)(`More than one artifact found for a single name, returning newest (id: ${artifact.databaseId})`);
        }
        const req = {
            workflowRunBackendId: artifact.workflowRunBackendId,
            workflowJobRunBackendId: artifact.workflowJobRunBackendId,
            name: artifact.name
        };
        const res = yield artifactClient.DeleteArtifact(req);
        (0, core_1.info)(`Artifact '${artifactName}' (ID: ${res.artifactId}) deleted`);
        return {
            id: Number(res.artifactId)
        };
    });
}
exports.deleteArtifactInternal = deleteArtifactInternal;
//# sourceMappingURL=delete-artifact.js.map