"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const testing_utils_1 = require("./testing-utils");
const tools_features_1 = require("./tools-features");
(0, ava_1.default)("isSupportedToolsFeature", async (t) => {
    const versionInfo = (0, testing_utils_1.makeVersionInfo)("1.0.0");
    t.false((0, tools_features_1.isSupportedToolsFeature)(versionInfo, tools_features_1.ToolsFeature.ForceOverwrite));
    versionInfo.features = { forceOverwrite: true };
    t.true((0, tools_features_1.isSupportedToolsFeature)(versionInfo, tools_features_1.ToolsFeature.ForceOverwrite));
});
//# sourceMappingURL=tools-features.test.js.map