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
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Check out repository at the given ref, and return the directory of the checkout.
 */
async function checkoutExternalRepository(repository, ref, tempDir) {
    core.info('Checking out ' + repository);
    const checkoutLocation = path.join(tempDir, repository);
    if (!fs.existsSync(checkoutLocation)) {
        const repoURL = 'https://github.com/' + repository + '.git';
        await exec.exec('git', ['clone', repoURL, checkoutLocation]);
        await exec.exec('git', [
            '--work-tree=' + checkoutLocation,
            '--git-dir=' + checkoutLocation + '/.git',
            'checkout', ref,
        ]);
    }
    return checkoutLocation;
}
exports.checkoutExternalRepository = checkoutExternalRepository;
//# sourceMappingURL=external-queries.js.map