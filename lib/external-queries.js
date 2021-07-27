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
exports.buildCheckoutURL = exports.checkoutExternalRepository = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
/**
 * Check out repository at the given ref, and return the directory of the checkout.
 */
async function checkoutExternalRepository(repository, ref, apiDetails, tempDir, logger) {
    logger.info(`Checking out ${repository}`);
    const checkoutLocation = path.join(tempDir, repository, ref);
    if (!checkoutLocation.startsWith(tempDir)) {
        // this still permits locations that mess with sibling repositories in `tempDir`, but that is acceptable
        throw new Error(`'${repository}@${ref}' is not a valid repository and reference.`);
    }
    if (!fs.existsSync(checkoutLocation)) {
        const repoCloneURL = buildCheckoutURL(repository, apiDetails);
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), [
            "clone",
            repoCloneURL,
            checkoutLocation,
        ]).exec();
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), [
            `--work-tree=${checkoutLocation}`,
            `--git-dir=${checkoutLocation}/.git`,
            "checkout",
            ref,
        ]).exec();
    }
    return checkoutLocation;
}
exports.checkoutExternalRepository = checkoutExternalRepository;
function buildCheckoutURL(repository, apiDetails) {
    const repoCloneURL = new URL(apiDetails.url);
    if (apiDetails.externalRepoAuth !== undefined) {
        repoCloneURL.username = "x-access-token";
        repoCloneURL.password = apiDetails.externalRepoAuth;
    }
    if (!repoCloneURL.pathname.endsWith("/")) {
        repoCloneURL.pathname += "/";
    }
    repoCloneURL.pathname += `${repository}`;
    return repoCloneURL.toString();
}
exports.buildCheckoutURL = buildCheckoutURL;
//# sourceMappingURL=external-queries.js.map