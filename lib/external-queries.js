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
const util = __importStar(require("./util"));
async function checkoutExternalQueries(config) {
    const folder = util.getRequiredEnvParam('RUNNER_TEMP');
    for (const externalQuery of config.externalQueries) {
        core.info('Checking out ' + externalQuery.repository);
        const checkoutLocation = path.join(folder, externalQuery.repository);
        if (!fs.existsSync(checkoutLocation)) {
            const repoURL = 'https://github.com/' + externalQuery.repository + '.git';
            await exec.exec('git', ['clone', repoURL, checkoutLocation]);
            await exec.exec('git', [
                '--work-tree=' + checkoutLocation,
                '--git-dir=' + checkoutLocation + '/.git',
                'checkout', externalQuery.ref,
            ]);
        }
        config.additionalQueries.push(path.join(checkoutLocation, externalQuery.path));
    }
}
exports.checkoutExternalQueries = checkoutExternalQueries;
//# sourceMappingURL=external-queries.js.map