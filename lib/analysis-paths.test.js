"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const analysisPaths = __importStar(require("./analysis-paths"));
const configUtils = __importStar(require("./config-utils"));
const testing_utils_1 = require("./testing-utils");
testing_utils_1.setupTests(ava_1.default);
ava_1.default("emptyPaths", async (t) => {
    let config = new configUtils.Config();
    analysisPaths.includeAndExcludeAnalysisPaths(config, []);
    t.is(process.env['LGTM_INDEX_INCLUDE'], undefined);
    t.is(process.env['LGTM_INDEX_EXCLUDE'], undefined);
    t.is(process.env['LGTM_INDEX_FILTERS'], undefined);
});
ava_1.default("nonEmptyPaths", async (t) => {
    let config = new configUtils.Config();
    config.paths.push('path1', 'path2', '**/path3');
    config.pathsIgnore.push('path4', 'path5', 'path6/**');
    analysisPaths.includeAndExcludeAnalysisPaths(config, []);
    t.is(process.env['LGTM_INDEX_INCLUDE'], 'path1\npath2');
    t.is(process.env['LGTM_INDEX_EXCLUDE'], 'path4\npath5');
    t.is(process.env['LGTM_INDEX_FILTERS'], 'include:path1\ninclude:path2\ninclude:**/path3\nexclude:path4\nexclude:path5\nexclude:path6/**');
});
//# sourceMappingURL=analysis-paths.test.js.map