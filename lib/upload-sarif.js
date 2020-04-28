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
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
async function run() {
    if (util.should_abort('upload-sarif', false) || !await util.reportActionStarting('upload-sarif')) {
        return;
    }
    try {
        await upload_lib.upload(core.getInput('sarif_file'));
    }
    catch (error) {
        core.setFailed(error.message);
        await util.reportActionFailed('upload-sarif', error.message, error.stack);
        return;
    }
    await util.reportActionSucceeded('upload-sarif');
}
run().catch(e => {
    core.setFailed("upload-sarif action failed: " + e);
    console.log(e);
});
