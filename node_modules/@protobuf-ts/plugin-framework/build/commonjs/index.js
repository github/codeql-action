"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./descriptor-info"), exports);
__exportStar(require("./descriptor-registry"), exports);
__exportStar(require("./descriptor-tree"), exports);
__exportStar(require("./generated-file"), exports);
__exportStar(require("./plugin-base"), exports);
__exportStar(require("./source-code-info"), exports);
__exportStar(require("./string-format"), exports);
__exportStar(require("./symbol-table"), exports);
__exportStar(require("./type-names"), exports);
__exportStar(require("./google/protobuf/descriptor"), exports);
__exportStar(require("./google/protobuf/compiler/plugin"), exports);
__exportStar(require("./typescript-compile"), exports);
__exportStar(require("./typescript-comments"), exports);
__exportStar(require("./typescript-import-manager"), exports);
__exportStar(require("./typescript-method-from-text"), exports);
__exportStar(require("./typescript-literal-from-value"), exports);
__exportStar(require("./typescript-enum-builder"), exports);
__exportStar(require("./typescript-file"), exports);
__exportStar(require("./typescript-imports"), exports);
