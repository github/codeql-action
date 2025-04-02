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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const gitUtils = __importStar(require("./git-utils"));
const logging_1 = require("./logging");
const overlay_database_utils_1 = require("./overlay-database-utils");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("writeOverlayChangesFile generates correct changes file", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const dbLocation = path.join(tmpDir, "db");
        await fs.promises.mkdir(dbLocation, { recursive: true });
        const sourceRoot = path.join(tmpDir, "src");
        await fs.promises.mkdir(sourceRoot, { recursive: true });
        const tempDir = path.join(tmpDir, "temp");
        await fs.promises.mkdir(tempDir, { recursive: true });
        const logger = (0, logging_1.getRunnerLogger)(true);
        const config = (0, testing_utils_1.createTestConfig)({ dbLocation });
        // Mock the getFileOidsUnderPath function to return base OIDs
        const baseOids = {
            "unchanged.js": "aaa111",
            "modified.js": "bbb222",
            "deleted.js": "ccc333",
        };
        const getFileOidsStubForBase = sinon
            .stub(gitUtils, "getFileOidsUnderPath")
            .resolves(baseOids);
        // Write the base database OIDs file
        await (0, overlay_database_utils_1.writeBaseDatabaseOidsFile)(config, sourceRoot);
        getFileOidsStubForBase.restore();
        // Mock the getFileOidsUnderPath function to return overlay OIDs
        const currentOids = {
            "unchanged.js": "aaa111",
            "modified.js": "ddd444", // Changed OID
            "added.js": "eee555", // New file
        };
        const getFileOidsStubForOverlay = sinon
            .stub(gitUtils, "getFileOidsUnderPath")
            .resolves(currentOids);
        // Write the overlay changes file, which uses the mocked overlay OIDs
        // and the base database OIDs file
        const getTempDirStub = sinon
            .stub(actionsUtil, "getTemporaryDirectory")
            .returns(tempDir);
        const changesFilePath = await (0, overlay_database_utils_1.writeOverlayChangesFile)(config, sourceRoot, logger);
        getFileOidsStubForOverlay.restore();
        getTempDirStub.restore();
        const fileContent = await fs.promises.readFile(changesFilePath, "utf-8");
        const parsedContent = JSON.parse(fileContent);
        t.deepEqual(parsedContent.changes.sort(), ["added.js", "deleted.js", "modified.js"], "Should identify added, deleted, and modified files");
    });
});
//# sourceMappingURL=overlay-database-utils.test.js.map