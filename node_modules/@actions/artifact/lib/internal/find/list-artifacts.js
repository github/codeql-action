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
exports.listArtifactsInternal = exports.listArtifactsPublic = void 0;
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const user_agent_1 = require("../shared/user-agent");
const retry_options_1 = require("./retry-options");
const utils_1 = require("@actions/github/lib/utils");
const plugin_request_log_1 = require("@octokit/plugin-request-log");
const plugin_retry_1 = require("@octokit/plugin-retry");
const artifact_twirp_client_1 = require("../shared/artifact-twirp-client");
const util_1 = require("../shared/util");
const generated_1 = require("../../generated");
// Limiting to 1000 for perf reasons
const maximumArtifactCount = 1000;
const paginationCount = 100;
const maxNumberOfPages = maximumArtifactCount / paginationCount;
function listArtifactsPublic(workflowRunId, repositoryOwner, repositoryName, token, latest = false) {
    return __awaiter(this, void 0, void 0, function* () {
        (0, core_1.info)(`Fetching artifact list for workflow run ${workflowRunId} in repository ${repositoryOwner}/${repositoryName}`);
        let artifacts = [];
        const [retryOpts, requestOpts] = (0, retry_options_1.getRetryOptions)(utils_1.defaults);
        const opts = {
            log: undefined,
            userAgent: (0, user_agent_1.getUserAgentString)(),
            previews: undefined,
            retry: retryOpts,
            request: requestOpts
        };
        const github = (0, github_1.getOctokit)(token, opts, plugin_retry_1.retry, plugin_request_log_1.requestLog);
        let currentPageNumber = 1;
        const { data: listArtifactResponse } = yield github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
            owner: repositoryOwner,
            repo: repositoryName,
            run_id: workflowRunId,
            per_page: paginationCount,
            page: currentPageNumber
        });
        let numberOfPages = Math.ceil(listArtifactResponse.total_count / paginationCount);
        const totalArtifactCount = listArtifactResponse.total_count;
        if (totalArtifactCount > maximumArtifactCount) {
            (0, core_1.warning)(`Workflow run ${workflowRunId} has more than 1000 artifacts. Results will be incomplete as only the first ${maximumArtifactCount} artifacts will be returned`);
            numberOfPages = maxNumberOfPages;
        }
        // Iterate over the first page
        for (const artifact of listArtifactResponse.artifacts) {
            artifacts.push({
                name: artifact.name,
                id: artifact.id,
                size: artifact.size_in_bytes,
                createdAt: artifact.created_at
                    ? new Date(artifact.created_at)
                    : undefined,
                digest: artifact.digest
            });
        }
        // Move to the next page
        currentPageNumber++;
        // Iterate over any remaining pages
        for (currentPageNumber; currentPageNumber < numberOfPages; currentPageNumber++) {
            (0, core_1.debug)(`Fetching page ${currentPageNumber} of artifact list`);
            const { data: listArtifactResponse } = yield github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
                owner: repositoryOwner,
                repo: repositoryName,
                run_id: workflowRunId,
                per_page: paginationCount,
                page: currentPageNumber
            });
            for (const artifact of listArtifactResponse.artifacts) {
                artifacts.push({
                    name: artifact.name,
                    id: artifact.id,
                    size: artifact.size_in_bytes,
                    createdAt: artifact.created_at
                        ? new Date(artifact.created_at)
                        : undefined,
                    digest: artifact.digest
                });
            }
        }
        if (latest) {
            artifacts = filterLatest(artifacts);
        }
        (0, core_1.info)(`Found ${artifacts.length} artifact(s)`);
        return {
            artifacts
        };
    });
}
exports.listArtifactsPublic = listArtifactsPublic;
function listArtifactsInternal(latest = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const artifactClient = (0, artifact_twirp_client_1.internalArtifactTwirpClient)();
        const { workflowRunBackendId, workflowJobRunBackendId } = (0, util_1.getBackendIdsFromToken)();
        const req = {
            workflowRunBackendId,
            workflowJobRunBackendId
        };
        const res = yield artifactClient.ListArtifacts(req);
        let artifacts = res.artifacts.map(artifact => {
            var _a;
            return ({
                name: artifact.name,
                id: Number(artifact.databaseId),
                size: Number(artifact.size),
                createdAt: artifact.createdAt
                    ? generated_1.Timestamp.toDate(artifact.createdAt)
                    : undefined,
                digest: (_a = artifact.digest) === null || _a === void 0 ? void 0 : _a.value
            });
        });
        if (latest) {
            artifacts = filterLatest(artifacts);
        }
        (0, core_1.info)(`Found ${artifacts.length} artifact(s)`);
        return {
            artifacts
        };
    });
}
exports.listArtifactsInternal = listArtifactsInternal;
/**
 * Filters a list of artifacts to only include the latest artifact for each name
 * @param artifacts The artifacts to filter
 * @returns The filtered list of artifacts
 */
function filterLatest(artifacts) {
    artifacts.sort((a, b) => b.id - a.id);
    const latestArtifacts = [];
    const seenArtifactNames = new Set();
    for (const artifact of artifacts) {
        if (!seenArtifactNames.has(artifact.name)) {
            latestArtifacts.push(artifact);
            seenArtifactNames.add(artifact.name);
        }
    }
    return latestArtifacts;
}
//# sourceMappingURL=list-artifacts.js.map