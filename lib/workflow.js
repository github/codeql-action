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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowErrors = void 0;
exports.getWorkflowErrors = getWorkflowErrors;
exports.validateWorkflow = validateWorkflow;
exports.formatWorkflowErrors = formatWorkflowErrors;
exports.formatWorkflowCause = formatWorkflowCause;
exports.getWorkflow = getWorkflow;
exports.getCategoryInputOrThrow = getCategoryInputOrThrow;
exports.getUploadInputOrThrow = getUploadInputOrThrow;
exports.getCheckoutPathInputOrThrow = getCheckoutPathInputOrThrow;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const core = __importStar(require("@actions/core"));
const yaml = __importStar(require("js-yaml"));
const api = __importStar(require("./api-client"));
const environment_1 = require("./environment");
const util_1 = require("./util");
function toCodedErrors(errors) {
    return Object.entries(errors).reduce((acc, [code, message]) => {
        acc[code] = { message, code };
        return acc;
    }, {});
}
// code to send back via status report
// message to add as a warning annotation to the run
exports.WorkflowErrors = toCodedErrors({
    MissingPushHook: `Please specify an on.push hook to analyze and see code scanning alerts from the default branch on the Security tab.`,
    CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
});
/**
 * Groups the given list of CodeQL languages by their extractor name.
 *
 * Resolves to `undefined` if the CodeQL version does not support language aliasing.
 */
async function groupLanguagesByExtractor(languages, codeql) {
    const resolveResult = await codeql.betterResolveLanguages();
    if (!resolveResult.aliases) {
        return undefined;
    }
    const aliases = resolveResult.aliases;
    const languagesByExtractor = {};
    for (const language of languages) {
        const extractorName = aliases[language] || language;
        if (!languagesByExtractor[extractorName]) {
            languagesByExtractor[extractorName] = [];
        }
        languagesByExtractor[extractorName].push(language);
    }
    return languagesByExtractor;
}
async function getWorkflowErrors(doc, codeql) {
    const errors = [];
    const jobName = process.env.GITHUB_JOB;
    if (jobName) {
        const job = doc?.jobs?.[jobName];
        if (job?.strategy?.matrix?.language) {
            const matrixLanguages = job.strategy.matrix.language;
            if (Array.isArray(matrixLanguages)) {
                // Map extractors to entries in the `language` matrix parameter. This will allow us to
                // detect languages which are analyzed in more than one job.
                const matrixLanguagesByExtractor = await groupLanguagesByExtractor(matrixLanguages, codeql);
                // If the CodeQL version does not support language aliasing, then `matrixLanguagesByExtractor`
                // will be `undefined`. In this case, we cannot detect duplicate languages in the matrix.
                if (matrixLanguagesByExtractor !== undefined) {
                    // Check for duplicate languages in the matrix
                    for (const [extractor, languages] of Object.entries(matrixLanguagesByExtractor)) {
                        if (languages.length > 1) {
                            errors.push({
                                message: `CodeQL language '${extractor}' is referenced by more than one entry in the ` +
                                    `'language' matrix parameter for job '${jobName}'. This may result in duplicate alerts. ` +
                                    `Please edit the 'language' matrix parameter to keep only one of the following: ${languages
                                        .map((language) => `'${language}'`)
                                        .join(", ")}.`,
                                code: "DuplicateLanguageInMatrix",
                            });
                        }
                    }
                }
            }
        }
        const steps = job?.steps;
        if (Array.isArray(steps)) {
            for (const step of steps) {
                // this was advice that we used to give in the README
                // we actually want to run the analysis on the merge commit
                // to produce results that are more inline with expectations
                // (i.e: this is what will happen if you merge this PR)
                // and avoid some race conditions
                if (step?.run === "git checkout HEAD^2") {
                    errors.push(exports.WorkflowErrors.CheckoutWrongHead);
                    break;
                }
            }
        }
    }
    // If there is no push trigger, we will not be able to analyze the default branch.
    // So add a warning to the user to add a push trigger.
    // If there is a workflow_call trigger, we don't need a push trigger since we assume
    // that the workflow_call trigger is called from a workflow that has a push trigger.
    const hasPushTrigger = hasWorkflowTrigger("push", doc);
    const hasPullRequestTrigger = hasWorkflowTrigger("pull_request", doc);
    const hasWorkflowCallTrigger = hasWorkflowTrigger("workflow_call", doc);
    if (hasPullRequestTrigger && !hasPushTrigger && !hasWorkflowCallTrigger) {
        errors.push(exports.WorkflowErrors.MissingPushHook);
    }
    return errors;
}
function hasWorkflowTrigger(triggerName, doc) {
    if (!doc.on) {
        return false;
    }
    if (typeof doc.on === "string") {
        return doc.on === triggerName;
    }
    if (Array.isArray(doc.on)) {
        return doc.on.includes(triggerName);
    }
    return Object.prototype.hasOwnProperty.call(doc.on, triggerName);
}
async function validateWorkflow(codeql, logger) {
    let workflow;
    try {
        workflow = await getWorkflow(logger);
    }
    catch (e) {
        return `error: getWorkflow() failed: ${String(e)}`;
    }
    let workflowErrors;
    try {
        workflowErrors = await getWorkflowErrors(workflow, codeql);
    }
    catch (e) {
        return `error: getWorkflowErrors() failed: ${String(e)}`;
    }
    if (workflowErrors.length > 0) {
        let message;
        try {
            message = formatWorkflowErrors(workflowErrors);
        }
        catch (e) {
            return `error: formatWorkflowErrors() failed: ${String(e)}`;
        }
        core.warning(message);
    }
    return formatWorkflowCause(workflowErrors);
}
function formatWorkflowErrors(errors) {
    const issuesWere = errors.length === 1 ? "issue was" : "issues were";
    const errorsList = errors.map((e) => e.message).join(" ");
    return `${errors.length} ${issuesWere} detected with this workflow: ${errorsList}`;
}
function formatWorkflowCause(errors) {
    if (errors.length === 0) {
        return undefined;
    }
    return errors.map((e) => e.code).join(",");
}
async function getWorkflow(logger) {
    // In default setup, the currently executing workflow is not checked into the repository.
    // Instead, a gzipped then base64 encoded version of the workflow file is provided via the
    // `CODE_SCANNING_WORKFLOW_FILE` environment variable.
    const maybeWorkflow = process.env["CODE_SCANNING_WORKFLOW_FILE"];
    if (maybeWorkflow) {
        logger.debug("Using the workflow specified by the CODE_SCANNING_WORKFLOW_FILE environment variable.");
        return yaml.load(zlib_1.default.gunzipSync(Buffer.from(maybeWorkflow, "base64")).toString());
    }
    const workflowPath = await getWorkflowAbsolutePath(logger);
    return yaml.load(fs.readFileSync(workflowPath, "utf-8"));
}
/**
 * Get the absolute path of the currently executing workflow.
 */
async function getWorkflowAbsolutePath(logger) {
    const relativePath = await api.getWorkflowRelativePath();
    const absolutePath = path.join((0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE"), relativePath);
    if (fs.existsSync(absolutePath)) {
        logger.debug(`Derived the following absolute path for the currently executing workflow: ${absolutePath}.`);
        return absolutePath;
    }
    throw new Error(`Expected to find a code scanning workflow file at ${absolutePath}, but no such file existed. ` +
        "This can happen if the currently running workflow checks out a branch that doesn't contain " +
        "the corresponding workflow file.");
}
function getStepsCallingAction(job, actionName) {
    if (job.uses) {
        throw new Error(`Could not get steps calling ${actionName} since the job calls a reusable workflow.`);
    }
    const steps = job.steps;
    if (!Array.isArray(steps)) {
        throw new Error(`Could not get steps calling ${actionName} since job.steps was not an array.`);
    }
    return steps.filter((step) => step.uses?.includes(actionName));
}
/**
 * Makes a best effort attempt to retrieve the value of a particular input with which
 * an Action in the workflow would be invoked.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the value of the input, or undefined if no such input is passed to the Action
 * @throws an error if the value of the input could not be determined, or we could not
 * determine that no such input is passed to the Action.
 */
function getInputOrThrow(workflow, jobName, actionName, inputName, matrixVars) {
    const preamble = `Could not get ${inputName} input to ${actionName} since`;
    if (!workflow.jobs) {
        throw new Error(`${preamble} the workflow has no jobs.`);
    }
    if (!workflow.jobs[jobName]) {
        throw new Error(`${preamble} the workflow has no job named ${jobName}.`);
    }
    const stepsCallingAction = getStepsCallingAction(workflow.jobs[jobName], actionName);
    if (stepsCallingAction.length === 0) {
        throw new Error(`${preamble} the ${jobName} job does not call ${actionName}.`);
    }
    else if (stepsCallingAction.length > 1) {
        throw new Error(`${preamble} the ${jobName} job calls ${actionName} multiple times.`);
    }
    let input = stepsCallingAction[0].with?.[inputName]?.toString();
    if (input !== undefined && matrixVars !== undefined) {
        // Normalize by removing whitespace
        input = input.replace(/\${{\s+/, "${{").replace(/\s+}}/, "}}");
        // Make a basic attempt to substitute matrix variables
        for (const [key, value] of Object.entries(matrixVars)) {
            input = input.replace(`\${{matrix.${key}}}`, value);
        }
    }
    if (input !== undefined && input.includes("${{")) {
        throw new Error(`Could not get ${inputName} input to ${actionName} since it contained an unrecognized dynamic value.`);
    }
    return input;
}
/**
 * Get the expected name of the analyze Action.
 *
 * This allows us to test workflow parsing functionality as a CodeQL Action PR check.
 */
function getAnalyzeActionName() {
    if ((0, util_1.isInTestMode)() ||
        process.env[environment_1.EnvVar.TESTING_ENVIRONMENT] === "codeql-action-pr-checks") {
        return "./analyze";
    }
    else {
        return "github/codeql-action/analyze";
    }
}
/**
 * Makes a best effort attempt to retrieve the category input for the particular job,
 * given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the category input, or undefined if the category input is not defined
 * @throws an error if the category input could not be determined
 */
function getCategoryInputOrThrow(workflow, jobName, matrixVars) {
    return getInputOrThrow(workflow, jobName, getAnalyzeActionName(), "category", matrixVars);
}
/**
 * Makes a best effort attempt to retrieve the upload input for the particular job,
 * given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the user input to upload, or undefined if input was unspecified
 * @throws an error if the upload input could not be determined
 */
function getUploadInputOrThrow(workflow, jobName, matrixVars) {
    return getInputOrThrow(workflow, jobName, getAnalyzeActionName(), "upload", matrixVars);
}
/**
 * Makes a best effort attempt to retrieve the checkout_path input for the
 * particular job, given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the checkout_path input
 * @throws an error if the checkout_path input could not be determined
 */
function getCheckoutPathInputOrThrow(workflow, jobName, matrixVars) {
    return (getInputOrThrow(workflow, jobName, getAnalyzeActionName(), "checkout_path", matrixVars) || (0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE") // if unspecified, checkout_path defaults to ${{ github.workspace }}
    );
}
//# sourceMappingURL=workflow.js.map