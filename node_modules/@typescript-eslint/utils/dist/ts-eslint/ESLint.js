"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESLint = exports.FlatESLint = exports.LegacyESLint = void 0;
var LegacyESLint_1 = require("./eslint/LegacyESLint");
// TODO(eslint@v10) - remove this in the next major
/**
 * @deprecated - use ESLint instead
 */
Object.defineProperty(exports, "LegacyESLint", { enumerable: true, get: function () { return LegacyESLint_1.LegacyESLint; } });
var FlatESLint_1 = require("./eslint/FlatESLint");
Object.defineProperty(exports, "FlatESLint", { enumerable: true, get: function () { return FlatESLint_1.FlatESLint; } });
var FlatESLint_2 = require("./eslint/FlatESLint");
Object.defineProperty(exports, "ESLint", { enumerable: true, get: function () { return FlatESLint_2.FlatESLint; } });
//# sourceMappingURL=ESLint.js.map