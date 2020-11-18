"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunnner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
/**
 * Check out repository at the given ref, and return the directory of the checkout.
 */
async function checkoutExternalRepository(repository, ref, githubUrl, tempDir, logger) {
    logger.info(`Checking out ${repository}`);
    const checkoutLocation = path.join(tempDir, repository, ref);
    if (!checkoutLocation.startsWith(tempDir)) {
        // this still permits locations that mess with sibling repositories in `tempDir`, but that is acceptable
        throw new Error(`'${repository}@${ref}' is not a valid repository and reference.`);
    }
    if (!fs.existsSync(checkoutLocation)) {
        const repoURL = `${githubUrl}/${repository}`;
        await new toolrunnner.ToolRunner(await safeWhich.safeWhich("git"), [
            "clone",
            repoURL,
            checkoutLocation,
        ]).exec();
        await new toolrunnner.ToolRunner(await safeWhich.safeWhich("git"), [
            `--work-tree=${checkoutLocation}`,
            `--git-dir=${checkoutLocation}/.git`,
            "checkout",
            ref,
        ]).exec();
    }
    return checkoutLocation;
}
exports.checkoutExternalRepository = checkoutExternalRepository;
//# sourceMappingURL=external-queries.js.map